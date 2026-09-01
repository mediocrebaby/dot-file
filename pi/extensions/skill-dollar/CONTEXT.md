# Skill Dollar

This context distinguishes mentioning a skill in user text from invoking that skill in the conversation.

## Language

**Skill mention**:
Literal `$name` text that identifies a skill while remaining part of the user's original message. It does not invoke the skill.
_Avoid_: Skill call, skill invocation

**Skill invocation**:
An action that loads a skill's instructions into the conversation context. A skill mention alone is not an invocation.
_Avoid_: Skill mention
