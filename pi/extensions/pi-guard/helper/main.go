package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"mvdan.cc/sh/v3/syntax"
)

const (
	defaultHelperVersion        = "dev"
	defaultProtocolVersion      = "1"
	analysisStatusComplete      = "complete"
	analysisStatusIncomplete    = "incomplete"
	analysisStatusError         = "error"
	maximumCommandBytes         = 1024 * 1024
	maximumJSONEscapeExpansion  = 6
	maximumRequestEnvelopeBytes = maximumCommandBytes*maximumJSONEscapeExpansion + 4096
	maximumASTNodes             = 100_000
	maximumNestedScriptDepth    = 32
	maximumFunctionCallDepth    = 32
	maximumRecoveredParseError  = 64
)

var (
	helperVersion   = defaultHelperVersion
	protocolVersion = defaultProtocolVersion
)

type helperRequest struct {
	ProtocolVersion int    `json:"protocolVersion"`
	Command         string `json:"command"`
}

type helperIdentity struct {
	HelperVersion   string `json:"helperVersion"`
	ProtocolVersion int    `json:"protocolVersion"`
	GOOS            string `json:"goos"`
	GOARCH          string `json:"goarch"`
}

type analysisResponse struct {
	ProtocolVersion int                  `json:"protocolVersion"`
	Status          string               `json:"status"`
	HasRmEvidence   bool                 `json:"hasRmEvidence"`
	Groups          []rmCommandGroup     `json:"groups"`
	Diagnostics     []analysisDiagnostic `json:"diagnostics"`
}

type rmCommandGroup struct {
	Command    string            `json:"command"`
	RmCommands []rmCommandDetail `json:"rmCommands"`
	Start      int               `json:"start"`
	End        int               `json:"end"`
}

type rmCommandDetail struct {
	Command   string   `json:"command"`
	Arguments []string `json:"arguments"`
}

type analysisDiagnostic struct {
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Column  int    `json:"column,omitempty"`
}

type sourceRange struct {
	start int
	end   int
}

type assignmentEvidence struct {
	name      string
	rangeInfo sourceRange
}

type analyzer struct {
	source             string
	file               *syntax.File
	parent             map[syntax.Node]syntax.Node
	groups             map[sourceRange]*rmCommandGroup
	diagnostics        []analysisDiagnostic
	literalRmVariables map[string]assignmentEvidence
	contextCommands    []sourceRange
	functions          map[string]*syntax.FuncDecl
	reachableFunctions map[string]bool
	incomplete         bool
	hasRmEvidence      bool
	nodeLimitReached   bool
	nestedDepth        int
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		writeJSON(helperIdentity{
			HelperVersion:   helperVersion,
			ProtocolVersion: mustProtocolVersion(),
			GOOS:            runtime.GOOS,
			GOARCH:          runtime.GOARCH,
		})
		return
	}

	requestBytes, err := io.ReadAll(io.LimitReader(os.Stdin, maximumRequestEnvelopeBytes+1))
	if err != nil {
		writeAnalysisError(fmt.Sprintf("读取 helper 请求失败: %v", err))
		return
	}
	if len(requestBytes) > maximumRequestEnvelopeBytes {
		writeAnalysisError(fmt.Sprintf("helper 请求超过 %d 字节限制", maximumRequestEnvelopeBytes))
		return
	}

	var request helperRequest
	if err := json.Unmarshal(requestBytes, &request); err != nil {
		writeAnalysisError(fmt.Sprintf("解析 helper 请求 JSON 失败: %v", err))
		return
	}
	if request.ProtocolVersion != mustProtocolVersion() {
		writeAnalysisError(fmt.Sprintf(
			"helper 请求协议版本不匹配: 收到 %d, 期望 %d",
			request.ProtocolVersion,
			mustProtocolVersion(),
		))
		return
	}
	if len(request.Command) > maximumCommandBytes {
		writeAnalysisError(fmt.Sprintf("Bash 输入超过 %d 字节限制", maximumCommandBytes))
		return
	}

	writeJSON(analyzeSource(request.Command, 0))
}

func analyzeSource(source string, nestedDepth int) analysisResponse {
	parser := syntax.NewParser(
		syntax.Variant(syntax.LangBash),
		syntax.KeepComments(true),
		syntax.RecoverErrors(maximumRecoveredParseError),
	)
	file, parseErr := parser.Parse(strings.NewReader(source), "command.sh")
	if file == nil {
		message := "Bash 解析器未返回 AST"
		if parseErr != nil {
			message = parseErr.Error()
		}
		return analysisResponse{
			ProtocolVersion: mustProtocolVersion(),
			Status:          analysisStatusError,
			Groups:          []rmCommandGroup{},
			Diagnostics:     []analysisDiagnostic{{Message: message}},
		}
	}

	a := &analyzer{
		source:             source,
		file:               file,
		parent:             make(map[syntax.Node]syntax.Node),
		groups:             make(map[sourceRange]*rmCommandGroup),
		diagnostics:        []analysisDiagnostic{},
		literalRmVariables: make(map[string]assignmentEvidence),
		functions:          make(map[string]*syntax.FuncDecl),
		reachableFunctions: make(map[string]bool),
		nestedDepth:        nestedDepth,
	}
	if parseErr != nil {
		a.incomplete = true
		a.diagnostics = append(a.diagnostics, analysisDiagnostic{Message: parseErr.Error()})
	}

	a.indexTree()
	a.collectStaticContext()
	a.collectReachableFunctions()
	a.inspectCalls()

	groups := make([]rmCommandGroup, 0, len(a.groups))
	for _, group := range a.groups {
		groups = append(groups, *group)
	}
	sort.Slice(groups, func(left, right int) bool {
		if groups[left].Start == groups[right].Start {
			return groups[left].End < groups[right].End
		}
		return groups[left].Start < groups[right].Start
	})

	status := analysisStatusComplete
	if a.incomplete || a.nodeLimitReached {
		status = analysisStatusIncomplete
	}
	return analysisResponse{
		ProtocolVersion: mustProtocolVersion(),
		Status:          status,
		HasRmEvidence:   a.hasRmEvidence,
		Groups:          groups,
		Diagnostics:     a.diagnostics,
	}
}

func (a *analyzer) indexTree() {
	stack := make([]syntax.Node, 0, 32)
	nodeCount := 0
	syntax.Walk(a.file, func(node syntax.Node) bool {
		if node == nil {
			stack = stack[:len(stack)-1]
			return true
		}

		nodeCount++
		if nodeCount > maximumASTNodes {
			if !a.nodeLimitReached {
				a.nodeLimitReached = true
				a.incomplete = true
				a.diagnostics = append(a.diagnostics, analysisDiagnostic{
					Message: fmt.Sprintf("AST 节点数量超过 %d 限制", maximumASTNodes),
				})
			}
			return false
		}
		if len(stack) > 0 {
			a.parent[node] = stack[len(stack)-1]
		}
		if node.Pos().IsRecovered() || node.End().IsRecovered() {
			a.incomplete = true
		}
		stack = append(stack, node)
		return true
	})
}

func (a *analyzer) collectStaticContext() {
	syntax.Walk(a.file, func(node syntax.Node) bool {
		if node == nil {
			return true
		}

		switch typed := node.(type) {
		case *syntax.FuncDecl:
			if typed.Name != nil && typed.Name.Value != "" {
				a.functions[typed.Name.Value] = typed
			}
		case *syntax.Assign:
			if typed.Name == nil || typed.Value == nil {
				return true
			}
			value, static := staticWordValue(typed.Value)
			if !static || !isRmExecutable(value) {
				return true
			}
			if statement := a.enclosingStatement(typed); statement != nil {
				if statementRange, ok := a.nodeRange(statement); ok {
					a.literalRmVariables[typed.Name.Value] = assignmentEvidence{
						name:      typed.Name.Value,
						rangeInfo: statementRange,
					}
				}
			}
		case *syntax.CallExpr:
			name, static := callCommandName(typed)
			if !static || (baseName(name) != "cd" && baseName(name) != "pushd") {
				return true
			}
			if statement := a.enclosingStatement(typed); statement != nil {
				if statementRange, ok := a.nodeRange(statement); ok {
					a.contextCommands = append(a.contextCommands, statementRange)
				}
			}
		}
		return true
	})
	sort.Slice(a.contextCommands, func(left, right int) bool {
		return a.contextCommands[left].start < a.contextCommands[right].start
	})
}

func (a *analyzer) collectReachableFunctions() {
	functionCalls := make(map[string]map[string]bool)
	topLevelCalls := make(map[string]bool)

	syntax.Walk(a.file, func(node syntax.Node) bool {
		if node == nil {
			return true
		}
		call, ok := node.(*syntax.CallExpr)
		if !ok {
			return true
		}
		name, static := callCommandName(call)
		if !static || name == "" {
			return true
		}
		name = baseName(name)
		owner := a.enclosingFunction(call)
		if owner == nil {
			topLevelCalls[name] = true
			return true
		}
		ownerName := functionName(owner)
		if ownerName == "" {
			return true
		}
		if functionCalls[ownerName] == nil {
			functionCalls[ownerName] = make(map[string]bool)
		}
		functionCalls[ownerName][name] = true
		return true
	})

	queue := make([]string, 0, len(topLevelCalls))
	for name := range topLevelCalls {
		if _, exists := a.functions[name]; exists {
			a.reachableFunctions[name] = true
			queue = append(queue, name)
		}
	}
	for depth := 0; len(queue) > 0 && depth < maximumFunctionCallDepth; depth++ {
		current := queue
		queue = nil
		for _, caller := range current {
			for callee := range functionCalls[caller] {
				if a.reachableFunctions[callee] {
					continue
				}
				if _, exists := a.functions[callee]; !exists {
					continue
				}
				a.reachableFunctions[callee] = true
				queue = append(queue, callee)
			}
		}
	}
	if len(queue) > 0 {
		a.incomplete = true
		a.diagnostics = append(a.diagnostics, analysisDiagnostic{
			Message: fmt.Sprintf("函数调用分析深度超过 %d 限制", maximumFunctionCallDepth),
		})
	}
}

func (a *analyzer) inspectCalls() {
	syntax.Walk(a.file, func(node syntax.Node) bool {
		if node == nil {
			return true
		}
		call, ok := node.(*syntax.CallExpr)
		if !ok {
			return true
		}

		if owner := a.enclosingFunction(call); owner != nil {
			ownerName := functionName(owner)
			if ownerName == "" || !a.reachableFunctions[ownerName] {
				return true
			}
		}
		a.inspectCall(call)
		return true
	})
}

func (a *analyzer) inspectCall(call *syntax.CallExpr) {
	if len(call.Args) == 0 {
		return
	}
	_, commandStatic := staticWordValue(call.Args[0])
	if !commandStatic {
		a.inspectDynamicCommand(call)
		return
	}

	commandIndex, confident, queryOnly := resolveExecutableIndex(call.Args)
	if queryOnly {
		return
	}
	if !confident {
		if rmIndex := findRmWord(call.Args, 1); rmIndex >= 0 {
			a.markUncertainRm(call, rmIndex, "无法可靠解析命令包装器选项")
		}
		return
	}
	if commandIndex < 0 || commandIndex >= len(call.Args) {
		return
	}

	executable, executableStatic := staticWordValue(call.Args[commandIndex])
	if !executableStatic {
		a.inspectDynamicCommand(call)
		return
	}
	executableBase := baseName(executable)

	if isRmExecutable(executable) {
		a.recordRmCall(call, commandIndex, call.Args[commandIndex+1:], false)
		return
	}
	if executableBase == "busybox" {
		a.inspectBusybox(call, commandIndex, false)
		return
	}
	if executableBase == "xargs" {
		a.inspectXargs(call, commandIndex)
		return
	}
	if executableBase == "find" {
		a.inspectFind(call, commandIndex)
		return
	}
	if executableBase == "eval" {
		a.inspectEval(call, commandIndex)
		return
	}
	if executableBase == "trap" {
		a.inspectTrap(call, commandIndex)
		return
	}
	if isShellExecutable(executableBase) {
		a.inspectShellCommand(call, commandIndex)
	}
}

func (a *analyzer) inspectBusybox(call *syntax.CallExpr, busyboxIndex int, forceIncomplete bool) {
	appletIndex := busyboxIndex + 1
	if appletIndex >= len(call.Args) {
		return
	}
	applet, static := staticWordValue(call.Args[appletIndex])
	if !static {
		return
	}
	appletBase := baseName(applet)
	if isRmExecutable(applet) {
		a.recordRmCall(call, appletIndex, call.Args[appletIndex+1:], forceIncomplete)
		return
	}
	if isShellExecutable(appletBase) {
		evidenceBefore := a.hasRmEvidence
		a.inspectShellCommand(call, appletIndex)
		if forceIncomplete && !evidenceBefore && a.hasRmEvidence {
			a.incomplete = true
		}
		return
	}
	if appletBase == "xargs" {
		a.inspectXargs(call, appletIndex)
		return
	}
	if appletBase == "find" {
		a.inspectFind(call, appletIndex)
		return
	}

	resolvedIndex, confident, queryOnly := resolveExecutableIndex(call.Args[appletIndex:])
	if queryOnly || !confident || resolvedIndex <= 0 {
		return
	}
	actualIndex := appletIndex + resolvedIndex
	if actualIndex >= len(call.Args) {
		return
	}
	executable, executableStatic := staticWordValue(call.Args[actualIndex])
	if executableStatic && isRmExecutable(executable) {
		a.recordRmCall(call, actualIndex, call.Args[actualIndex+1:], forceIncomplete)
	}
}

func (a *analyzer) inspectDynamicCommand(call *syntax.CallExpr) {
	parameterNames := parameterNamesInWord(call.Args[0])
	if len(parameterNames) == 0 {
		return
	}
	for parameterName := range parameterNames {
		evidence, exists := a.literalRmVariables[parameterName]
		if !exists {
			continue
		}
		a.hasRmEvidence = true
		a.incomplete = true
		groupRange := a.groupRange(call, call.Args[1:])
		if evidence.rangeInfo.start < groupRange.start {
			groupRange.start = evidence.rangeInfo.start
		}
		detailRange, _ := a.nodeRange(call)
		a.addGroup(groupRange, rmCommandDetail{
			Command:   a.slice(detailRange),
			Arguments: a.wordSlices(call.Args[1:]),
		})
		return
	}
}

func (a *analyzer) recordRmCall(
	call *syntax.CallExpr,
	rmIndex int,
	argumentWords []*syntax.Word,
	forceIncomplete bool,
) {
	a.hasRmEvidence = true
	dynamicArguments := forceIncomplete || wordsHaveRuntimeExpansion(argumentWords)
	if dynamicArguments {
		a.incomplete = true
	}

	groupRange := a.groupRange(call, argumentWords)
	if owner := a.enclosingFunction(call); owner != nil {
		groupRange = a.fileRange()
		a.incomplete = true
	}
	rmRange := sourceRange{
		start: int(call.Args[rmIndex].Pos().Offset()),
		end:   int(call.End().Offset()),
	}
	if rmRange.end < rmRange.start || rmRange.end > len(a.source) {
		a.incomplete = true
		return
	}
	a.addGroup(groupRange, rmCommandDetail{
		Command:   a.slice(rmRange),
		Arguments: a.wordSlices(argumentWords),
	})
}

func (a *analyzer) markUncertainRm(call *syntax.CallExpr, rmIndex int, message string) {
	a.hasRmEvidence = true
	a.incomplete = true
	a.diagnostics = append(a.diagnostics, analysisDiagnostic{Message: message})
	groupRange := a.groupRange(call, call.Args[rmIndex+1:])
	rmRange := sourceRange{
		start: int(call.Args[rmIndex].Pos().Offset()),
		end:   int(call.End().Offset()),
	}
	a.addGroup(groupRange, rmCommandDetail{
		Command:   a.slice(rmRange),
		Arguments: a.wordSlices(call.Args[rmIndex+1:]),
	})
}

func (a *analyzer) inspectXargs(call *syntax.CallExpr, commandIndex int) {
	utilityIndex, confident := xargsUtilityIndex(call.Args, commandIndex+1)
	if !confident {
		a.incomplete = true
		a.diagnostics = append(a.diagnostics, analysisDiagnostic{Message: "无法可靠解析 xargs 选项"})
		if rmIndex := findRmWord(call.Args, commandIndex+1); rmIndex >= 0 {
			a.markUncertainRm(call, rmIndex, "xargs 选项之后存在 rm 证据")
		}
		return
	}
	if utilityIndex < 0 {
		return
	}
	resolvedIndex, wrapperConfident, queryOnly := resolveExecutableIndex(call.Args[utilityIndex:])
	if queryOnly {
		return
	}
	if !wrapperConfident {
		if rmIndex := findRmWord(call.Args, utilityIndex); rmIndex >= 0 {
			a.markUncertainRm(call, rmIndex, "无法可靠解析 xargs utility 包装器")
		}
		return
	}
	actualIndex := utilityIndex + resolvedIndex
	if actualIndex < utilityIndex || actualIndex >= len(call.Args) {
		return
	}
	executable, static := staticWordValue(call.Args[actualIndex])
	if !static {
		return
	}
	if isRmExecutable(executable) {
		a.recordRmCall(call, actualIndex, call.Args[actualIndex+1:], true)
		return
	}
	if baseName(executable) == "busybox" {
		a.inspectBusybox(call, actualIndex, true)
		return
	}
	if isShellExecutable(baseName(executable)) {
		evidenceBefore := a.hasRmEvidence
		a.inspectShellCommand(call, actualIndex)
		if !evidenceBefore && a.hasRmEvidence {
			a.incomplete = true
		}
	}
}

func (a *analyzer) inspectFind(call *syntax.CallExpr, commandIndex int) {
	for index := commandIndex + 1; index+1 < len(call.Args); index++ {
		operator, static := staticWordValue(call.Args[index])
		if !static || (operator != "-exec" && operator != "-execdir") {
			continue
		}
		segmentEnd := findFindTerminator(call.Args, index+1)
		if segmentEnd <= index+1 {
			continue
		}
		segment := call.Args[index+1 : segmentEnd]
		resolvedIndex, confident, queryOnly := resolveExecutableIndex(segment)
		if queryOnly {
			index = segmentEnd
			continue
		}
		if !confident || resolvedIndex < 0 || resolvedIndex >= len(segment) {
			if rmOffset := findRmWord(segment, 0); rmOffset >= 0 {
				a.markUncertainRm(call, index+1+rmOffset, "无法可靠解析 find -exec 包装器")
			}
			index = segmentEnd
			continue
		}
		executableIndex := index + 1 + resolvedIndex
		executable, executableStatic := staticWordValue(call.Args[executableIndex])
		if executableStatic && isRmExecutable(executable) {
			a.recordRmCall(call, executableIndex, call.Args[executableIndex+1:segmentEnd], true)
		} else if executableStatic && isShellExecutable(baseName(executable)) {
			evidenceBefore := a.hasRmEvidence
			a.inspectShellCommand(call, executableIndex)
			if !evidenceBefore && a.hasRmEvidence {
				a.incomplete = true
			}
		} else if executableStatic && baseName(executable) == "busybox" {
			a.inspectBusybox(call, executableIndex, true)
		}
		index = segmentEnd
	}
}

func (a *analyzer) inspectTrap(call *syntax.CallExpr, commandIndex int) {
	actionIndex := commandIndex + 1
	if actionIndex < len(call.Args) {
		value, static := staticWordValue(call.Args[actionIndex])
		if static && value == "--" {
			actionIndex++
		}
	}
	if actionIndex >= len(call.Args) {
		return
	}
	action, static := staticWordValue(call.Args[actionIndex])
	if !static || action == "" || action == "-" || strings.HasPrefix(action, "-") {
		return
	}
	a.mergeNestedScript(call, action)
}

func (a *analyzer) inspectEval(call *syntax.CallExpr, commandIndex int) {
	if commandIndex+1 >= len(call.Args) {
		return
	}
	parts := make([]string, 0, len(call.Args)-commandIndex-1)
	for _, word := range call.Args[commandIndex+1:] {
		value, static := staticWordValue(word)
		if !static {
			return
		}
		parts = append(parts, value)
	}
	a.mergeNestedScript(call, strings.Join(parts, " "))
}

func (a *analyzer) inspectShellCommand(call *syntax.CallExpr, commandIndex int) {
	payloadIndex := shellPayloadIndex(call.Args, commandIndex+1)
	if payloadIndex >= 0 && payloadIndex < len(call.Args) {
		payload, static := staticWordValue(call.Args[payloadIndex])
		if static {
			a.mergeNestedScript(call, payload)
		}
		return
	}

	if a.nestedDepth >= maximumNestedScriptDepth {
		a.incomplete = true
		return
	}
	for index := commandIndex + 1; index < len(call.Args); index++ {
		candidate, static := staticWordValue(call.Args[index])
		if !static || candidate == "" {
			continue
		}
		nested := analyzeSource(candidate, a.nestedDepth+1)
		if !nested.HasRmEvidence && len(nested.Groups) == 0 {
			continue
		}
		a.incomplete = true
		a.mergeNestedScript(call, candidate)
		return
	}
	if inputNode := a.shellInputNode(call); inputNode != nil {
		if candidate, found := a.findStaticRmScript(inputNode); found {
			a.incomplete = true
			a.mergeNestedScript(call, candidate)
		}
	}
}

func (a *analyzer) shellInputNode(call *syntax.CallExpr) syntax.Node {
	if statement := a.enclosingStatement(call); statement != nil {
		for _, redirect := range statement.Redirs {
			switch redirect.Op.String() {
			case "<<<":
				if redirect.Word != nil {
					return redirect.Word
				}
			case "<<", "<<-":
				if redirect.Hdoc != nil {
					return redirect.Hdoc
				}
			}
		}
	}
	for current := a.parent[call]; current != nil; current = a.parent[current] {
		binary, ok := current.(*syntax.BinaryCmd)
		if !ok || binary.Y == nil {
			continue
		}
		operator := binary.Op.String()
		if operator != "|" && operator != "|&" {
			continue
		}
		if call.Pos().Offset() >= binary.Y.Pos().Offset() {
			return binary.X
		}
	}
	return nil
}

func (a *analyzer) findStaticRmScript(node syntax.Node) (string, bool) {
	if a.nestedDepth >= maximumNestedScriptDepth {
		return "", false
	}
	candidate := ""
	syntax.Walk(node, func(current syntax.Node) bool {
		if current == nil || candidate != "" {
			return candidate == ""
		}
		word, ok := current.(*syntax.Word)
		if !ok {
			return true
		}
		value, static := staticWordValue(word)
		if !static || value == "" {
			return true
		}
		nested := analyzeSource(value, a.nestedDepth+1)
		if nested.HasRmEvidence || len(nested.Groups) > 0 {
			candidate = value
			return false
		}
		return true
	})
	return candidate, candidate != ""
}

func (a *analyzer) mergeNestedScript(call *syntax.CallExpr, script string) {
	if a.nestedDepth >= maximumNestedScriptDepth {
		a.incomplete = true
		a.diagnostics = append(a.diagnostics, analysisDiagnostic{
			Message: fmt.Sprintf("内嵌脚本递归深度超过 %d 限制", maximumNestedScriptDepth),
		})
		return
	}
	nested := analyzeSource(script, a.nestedDepth+1)
	if nested.Status != analysisStatusComplete {
		a.incomplete = true
	}
	if !nested.HasRmEvidence && len(nested.Groups) == 0 {
		return
	}

	a.hasRmEvidence = true
	groupRange := a.groupRange(call, call.Args[1:])
	details := make([]rmCommandDetail, 0)
	for _, group := range nested.Groups {
		details = append(details, group.RmCommands...)
	}
	if len(details) == 0 {
		details = append(details, rmCommandDetail{Command: script, Arguments: []string{}})
	}
	for _, detail := range details {
		a.addGroup(groupRange, detail)
	}
}

func (a *analyzer) groupRange(call *syntax.CallExpr, arguments []*syntax.Word) sourceRange {
	statement := a.enclosingStatement(call)
	if statement == nil {
		if callRange, ok := a.nodeRange(call); ok {
			return callRange
		}
		return a.fileRange()
	}
	groupRange, ok := a.statementRange(statement)
	if !ok {
		return a.fileRange()
	}

	for node := a.parent[statement]; node != nil; node = a.parent[node] {
		switch typed := node.(type) {
		case *syntax.ForClause, *syntax.WhileClause, *syntax.IfClause,
			*syntax.CaseClause, *syntax.Subshell, *syntax.Block:
			if compoundRange, valid := a.nodeRange(typed); valid {
				return compoundRange
			}
		case *syntax.BinaryCmd:
			if binaryNeedsContext(typed, call) {
				if binaryRange, valid := a.nodeRange(typed); valid {
					groupRange = binaryRange
				}
			}
		}
	}

	if wordsCouldUseWorkingDirectory(arguments) {
		for index := len(a.contextCommands) - 1; index >= 0; index-- {
			contextRange := a.contextCommands[index]
			if contextRange.start < groupRange.start {
				groupRange.start = contextRange.start
				break
			}
		}
	}
	for parameterName := range parameterNamesInWords(arguments) {
		if evidence, exists := a.literalRmVariables[parameterName]; exists {
			if evidence.rangeInfo.start < groupRange.start {
				groupRange.start = evidence.rangeInfo.start
			}
		}
	}
	return groupRange
}

func (a *analyzer) addGroup(groupRange sourceRange, detail rmCommandDetail) {
	if !a.validRange(groupRange) {
		a.incomplete = true
		return
	}
	group, exists := a.groups[groupRange]
	if !exists {
		group = &rmCommandGroup{
			Command:    a.slice(groupRange),
			RmCommands: []rmCommandDetail{},
			Start:      groupRange.start,
			End:        groupRange.end,
		}
		a.groups[groupRange] = group
	}
	for _, existing := range group.RmCommands {
		if existing.Command == detail.Command && stringSlicesEqual(existing.Arguments, detail.Arguments) {
			return
		}
	}
	group.RmCommands = append(group.RmCommands, detail)
}

func (a *analyzer) wordSlices(words []*syntax.Word) []string {
	values := make([]string, 0, len(words))
	for _, word := range words {
		wordRange, ok := a.nodeRange(word)
		if !ok {
			a.incomplete = true
			continue
		}
		values = append(values, a.slice(wordRange))
	}
	return values
}

func (a *analyzer) enclosingStatement(node syntax.Node) *syntax.Stmt {
	for current := a.parent[node]; current != nil; current = a.parent[current] {
		if statement, ok := current.(*syntax.Stmt); ok {
			return statement
		}
	}
	return nil
}

func (a *analyzer) enclosingFunction(node syntax.Node) *syntax.FuncDecl {
	for current := a.parent[node]; current != nil; current = a.parent[current] {
		if function, ok := current.(*syntax.FuncDecl); ok {
			return function
		}
	}
	return nil
}

func (a *analyzer) statementRange(statement *syntax.Stmt) (sourceRange, bool) {
	rangeInfo, ok := a.nodeRange(statement)
	if !ok {
		return sourceRange{}, false
	}
	if statement.Semicolon.IsValid() {
		terminatorOffset := int(statement.Semicolon.Offset())
		if terminatorOffset >= rangeInfo.start && terminatorOffset < rangeInfo.end {
			rangeInfo.end = terminatorOffset
		}
	}
	return rangeInfo, a.validRange(rangeInfo)
}

func (a *analyzer) nodeRange(node syntax.Node) (sourceRange, bool) {
	if node == nil || !node.Pos().IsValid() || !node.End().IsValid() {
		return sourceRange{}, false
	}
	rangeInfo := sourceRange{
		start: int(node.Pos().Offset()),
		end:   int(node.End().Offset()),
	}
	return rangeInfo, a.validRange(rangeInfo)
}

func (a *analyzer) fileRange() sourceRange {
	if fileRange, ok := a.nodeRange(a.file); ok {
		return fileRange
	}
	return sourceRange{start: 0, end: len(a.source)}
}

func (a *analyzer) validRange(rangeInfo sourceRange) bool {
	return rangeInfo.start >= 0 && rangeInfo.end >= rangeInfo.start && rangeInfo.end <= len(a.source)
}

func (a *analyzer) slice(rangeInfo sourceRange) string {
	if !a.validRange(rangeInfo) {
		return ""
	}
	return a.source[rangeInfo.start:rangeInfo.end]
}

func staticWordValue(word *syntax.Word) (string, bool) {
	if word == nil {
		return "", false
	}
	var builder strings.Builder
	for _, part := range word.Parts {
		value, static := staticWordPartValue(part)
		if !static {
			return "", false
		}
		builder.WriteString(value)
	}
	return builder.String(), true
}

func staticWordPartValue(part syntax.WordPart) (string, bool) {
	switch typed := part.(type) {
	case *syntax.Lit:
		return typed.Value, true
	case *syntax.SglQuoted:
		return typed.Value, true
	case *syntax.DblQuoted:
		var builder strings.Builder
		for _, nested := range typed.Parts {
			value, static := staticWordPartValue(nested)
			if !static {
				return "", false
			}
			builder.WriteString(value)
		}
		return builder.String(), true
	default:
		return "", false
	}
}

func wordsHaveRuntimeExpansion(words []*syntax.Word) bool {
	for _, word := range words {
		if wordHasRuntimeExpansion(word, false) {
			return true
		}
	}
	return false
}

func wordHasRuntimeExpansion(word *syntax.Word, quoted bool) bool {
	if word == nil {
		return true
	}
	for _, part := range word.Parts {
		switch typed := part.(type) {
		case *syntax.Lit:
			if !quoted && strings.ContainsAny(typed.Value, "*?[") {
				return true
			}
		case *syntax.SglQuoted:
			continue
		case *syntax.DblQuoted:
			for _, nested := range typed.Parts {
				if nestedWordPartHasRuntimeExpansion(nested, true) {
					return true
				}
			}
		default:
			return true
		}
	}
	return false
}

func nestedWordPartHasRuntimeExpansion(part syntax.WordPart, quoted bool) bool {
	switch typed := part.(type) {
	case *syntax.Lit:
		return !quoted && strings.ContainsAny(typed.Value, "*?[")
	case *syntax.SglQuoted:
		return false
	case *syntax.DblQuoted:
		for _, nested := range typed.Parts {
			if nestedWordPartHasRuntimeExpansion(nested, true) {
				return true
			}
		}
		return false
	default:
		return true
	}
}

func callCommandName(call *syntax.CallExpr) (string, bool) {
	if call == nil || len(call.Args) == 0 {
		return "", false
	}
	return staticWordValue(call.Args[0])
}

func resolveExecutableIndex(words []*syntax.Word) (index int, confident bool, queryOnly bool) {
	if len(words) == 0 {
		return -1, true, false
	}
	index = 0
	for index < len(words) {
		name, static := staticWordValue(words[index])
		if !static {
			return index, true, false
		}
		switch baseName(name) {
		case "command":
			next, ok, query := commandWrapperIndex(words, index+1)
			if query {
				return -1, true, true
			}
			if !ok {
				return -1, false, false
			}
			index = next
		case "builtin", "nohup":
			next, ok := simpleWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		case "exec":
			next, ok := execWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		case "env":
			next, ok := envWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		case "sudo":
			next, ok := sudoWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		case "timeout":
			next, ok := timeoutWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		case "nice":
			next, ok := niceWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		case "setsid":
			next, ok := setsidWrapperIndex(words, index+1)
			if !ok {
				return -1, false, false
			}
			index = next
		default:
			return index, true, false
		}
	}
	return -1, false, false
}

func commandWrapperIndex(words []*syntax.Word, start int) (int, bool, bool) {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words), false
		}
		if value == "-v" || value == "-V" {
			return -1, true, true
		}
		if value == "-p" {
			continue
		}
		if strings.HasPrefix(value, "-") {
			return -1, false, false
		}
		return index, true, false
	}
	return -1, false, false
}

func simpleWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if strings.HasPrefix(value, "-") {
			continue
		}
		return index, true
	}
	return -1, false
}

func execWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if value == "-a" {
			index++
			if index >= len(words) {
				return -1, false
			}
			continue
		}
		if value == "-c" || value == "-l" {
			continue
		}
		if strings.HasPrefix(value, "-") {
			return -1, false
		}
		return index, true
	}
	return -1, false
}

func envWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	valueOptions := map[string]bool{
		"-u": true, "--unset": true,
		"-C": true, "--chdir": true,
		"-S": true, "--split-string": true,
	}
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if valueOptions[value] {
			index++
			if index >= len(words) {
				return -1, false
			}
			continue
		}
		if strings.HasPrefix(value, "-") {
			continue
		}
		if strings.Contains(value, "=") {
			continue
		}
		return index, true
	}
	return -1, false
}

func sudoWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	valueOptions := map[string]bool{
		"-C": true, "--close-from": true,
		"-D": true, "--chdir": true,
		"-g": true, "--group": true,
		"-h": true, "--host": true,
		"-p": true, "--prompt": true,
		"-R": true, "--chroot": true,
		"-r": true, "--role": true,
		"-t": true, "--type": true,
		"-T": true, "--command-timeout": true,
		"-u": true, "--user": true,
		"-U": true, "--other-user": true,
	}
	flagOptions := map[string]bool{
		"-A": true, "--askpass": true,
		"-b": true, "--background": true,
		"-E": true, "--preserve-env": true,
		"-H": true, "--set-home": true,
		"-K": true, "--remove-timestamp": true,
		"-k": true, "--reset-timestamp": true,
		"-n": true, "--non-interactive": true,
		"-P": true, "--preserve-groups": true,
		"-S": true, "--stdin": true,
	}
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if valueOptions[value] {
			index++
			if index >= len(words) {
				return -1, false
			}
			continue
		}
		if flagOptions[value] || strings.HasPrefix(value, "--preserve-env=") {
			continue
		}
		if strings.HasPrefix(value, "-") {
			return -1, false
		}
		return index, true
	}
	return -1, false
}

func timeoutWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	valueOptions := map[string]bool{
		"-k": true, "--kill-after": true,
		"-s": true, "--signal": true,
	}
	index := start
	for ; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			index++
			break
		}
		if valueOptions[value] {
			index++
			if index >= len(words) {
				return -1, false
			}
			continue
		}
		if strings.HasPrefix(value, "--kill-after=") || strings.HasPrefix(value, "--signal=") {
			continue
		}
		if strings.HasPrefix(value, "-") {
			continue
		}
		break
	}
	if index >= len(words) {
		return -1, false
	}
	index++ // duration
	return index, index < len(words)
}

func niceWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if value == "-n" || value == "--adjustment" {
			index++
			if index >= len(words) {
				return -1, false
			}
			continue
		}
		if strings.HasPrefix(value, "--adjustment=") || isSignedIntegerOption(value) {
			continue
		}
		if strings.HasPrefix(value, "-") {
			return -1, false
		}
		return index, true
	}
	return -1, false
}

func setsidWrapperIndex(words []*syntax.Word, start int) (int, bool) {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if value == "-c" || value == "--ctty" || value == "-f" || value == "--fork" || value == "-w" || value == "--wait" {
			continue
		}
		if strings.HasPrefix(value, "-") {
			return -1, false
		}
		return index, true
	}
	return -1, false
}

func isSignedIntegerOption(value string) bool {
	if len(value) < 2 || value[0] != '-' {
		return false
	}
	for _, character := range value[1:] {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func shellPayloadIndex(words []*syntax.Word, start int) int {
	valueOptions := map[string]bool{
		"-O": true, "+O": true,
		"-o": true, "+o": true,
		"--rcfile":    true,
		"--init-file": true,
	}
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1
		}
		if value == "--" {
			return -1
		}
		if valueOptions[value] {
			index++
			if index >= len(words) {
				return -1
			}
			continue
		}
		if strings.HasPrefix(value, "--rcfile=") || strings.HasPrefix(value, "--init-file=") {
			continue
		}
		if value == "-c" || value == "+c" {
			if index+1 < len(words) {
				return index + 1
			}
			return -1
		}
		if strings.HasPrefix(value, "-") && !strings.HasPrefix(value, "--") {
			flags := strings.TrimPrefix(value, "-")
			if strings.Contains(flags, "c") {
				if index+1 < len(words) {
					return index + 1
				}
				return -1
			}
			continue
		}
		if strings.HasPrefix(value, "+") {
			continue
		}
		if strings.HasPrefix(value, "--") {
			continue
		}
		return -1
	}
	return -1
}

func xargsUtilityIndex(words []*syntax.Word, start int) (int, bool) {
	valueOptions := map[string]bool{
		"-a": true, "--arg-file": true,
		"-d": true, "--delimiter": true,
		"-E": true,
		"-I": true,
		"-J": true,
		"-L": true,
		"-n": true, "--max-args": true,
		"-P": true, "--max-procs": true,
		"-R": true,
		"-S": true,
		"-s": true, "--max-chars": true,
	}
	flagOptions := map[string]bool{
		"-0": true, "--null": true,
		"-e": true, "--eof": true,
		"-i": true, "--replace": true,
		"-l": true, "--max-lines": true,
		"-o": true, "--open-tty": true,
		"-p": true, "--interactive": true,
		"-r": true, "--no-run-if-empty": true,
		"-t": true, "--verbose": true,
		"-x": true, "--exit": true,
	}
	attachedValuePrefixes := []string{
		"-a", "-d", "-E", "-e", "-i", "-I", "-J", "-l", "-L",
		"-n", "-P", "-R", "-S", "-s",
	}
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if !static {
			return -1, false
		}
		if value == "--" {
			return index + 1, index+1 < len(words)
		}
		if valueOptions[value] {
			index++
			if index >= len(words) {
				return -1, false
			}
			continue
		}
		if flagOptions[value] {
			continue
		}
		if isKnownXargsLongOptionAssignment(value) {
			continue
		}
		attached := false
		for _, prefix := range attachedValuePrefixes {
			if strings.HasPrefix(value, prefix) && len(value) > len(prefix) {
				attached = true
				break
			}
		}
		if attached {
			continue
		}
		if strings.HasPrefix(value, "-") {
			return -1, false
		}
		return index, true
	}
	return -1, true
}

func isKnownXargsLongOptionAssignment(value string) bool {
	knownPrefixes := []string{
		"--arg-file=",
		"--delimiter=",
		"--eof=",
		"--replace=",
		"--max-lines=",
		"--max-args=",
		"--max-procs=",
		"--max-chars=",
	}
	for _, prefix := range knownPrefixes {
		if strings.HasPrefix(value, prefix) {
			return true
		}
	}
	return false
}

func findRmWord(words []*syntax.Word, start int) int {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if static && isRmExecutable(value) {
			return index
		}
	}
	return -1
}

func findFindTerminator(words []*syntax.Word, start int) int {
	for index := start; index < len(words); index++ {
		value, static := staticWordValue(words[index])
		if static && (value == ";" || value == "\\;" || value == "+") {
			return index
		}
	}
	return len(words)
}

func isShellExecutable(name string) bool {
	switch name {
	case "bash", "sh", "dash", "zsh", "ksh":
		return true
	default:
		return false
	}
}

func isRmExecutable(name string) bool {
	base := baseName(name)
	return base == "rm" || base == "rm.exe"
}

func baseName(name string) string {
	normalized := strings.ReplaceAll(name, "\\", "/")
	return filepath.Base(normalized)
}

func parameterNamesInWords(words []*syntax.Word) map[string]bool {
	result := make(map[string]bool)
	for _, word := range words {
		for name := range parameterNamesInWord(word) {
			result[name] = true
		}
	}
	return result
}

func parameterNamesInWord(word *syntax.Word) map[string]bool {
	result := make(map[string]bool)
	if word == nil {
		return result
	}
	syntax.Walk(word, func(node syntax.Node) bool {
		if node == nil {
			return true
		}
		parameter, ok := node.(*syntax.ParamExp)
		if ok && parameter.Param != nil && parameter.Param.Value != "" {
			result[parameter.Param.Value] = true
		}
		return true
	})
	return result
}

func wordsCouldUseWorkingDirectory(words []*syntax.Word) bool {
	optionsEnded := false
	for _, word := range words {
		value, static := staticWordValue(word)
		if !static {
			return true
		}
		if !optionsEnded && value == "--" {
			optionsEnded = true
			continue
		}
		if !optionsEnded && strings.HasPrefix(value, "-") {
			continue
		}
		if filepath.IsAbs(value) || strings.HasPrefix(value, "~") {
			continue
		}
		return true
	}
	return false
}

func binaryNeedsContext(binary *syntax.BinaryCmd, call *syntax.CallExpr) bool {
	if binary == nil || call == nil {
		return false
	}
	operator := binary.Op.String()
	if operator == "|" || operator == "|&" {
		return true
	}
	callOffset := call.Pos().Offset()
	if binary.Y != nil && callOffset >= binary.Y.Pos().Offset() {
		return statementContainsContextCommand(binary.X)
	}
	return false
}

func statementContainsContextCommand(statement *syntax.Stmt) bool {
	found := false
	if statement == nil {
		return false
	}
	syntax.Walk(statement, func(node syntax.Node) bool {
		if node == nil || found {
			return !found
		}
		call, ok := node.(*syntax.CallExpr)
		if !ok {
			return true
		}
		name, static := callCommandName(call)
		if static && (baseName(name) == "cd" || baseName(name) == "pushd") {
			found = true
			return false
		}
		if len(call.Assigns) > 0 && len(call.Args) == 0 {
			found = true
			return false
		}
		return true
	})
	return found
}

func functionName(function *syntax.FuncDecl) string {
	if function == nil || function.Name == nil {
		return ""
	}
	return function.Name.Value
}

func stringSlicesEqual(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func mustProtocolVersion() int {
	value, err := strconv.Atoi(protocolVersion)
	if err != nil || value <= 0 {
		panic(fmt.Sprintf("无效的 helper 协议版本 %q", protocolVersion))
	}
	return value
}

func writeAnalysisError(message string) {
	writeJSON(analysisResponse{
		ProtocolVersion: mustProtocolVersion(),
		Status:          analysisStatusError,
		Groups:          []rmCommandGroup{},
		Diagnostics:     []analysisDiagnostic{{Message: message}},
	})
}

func writeJSON(value any) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil && !errors.Is(err, os.ErrClosed) {
		fmt.Fprintf(os.Stderr, "写入 helper JSON 响应失败: %v\n", err)
		os.Exit(1)
	}
}
