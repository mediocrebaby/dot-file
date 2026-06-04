// mach.h —— sketchybar mach 客户端(精简子集)
//
// 来源:派生自 FelixKratz/SbarLua 的 src/mach.h(MIT),仅保留"向 sketchybar
// 守护进程发送命令"所需的客户端部分:bootstrap 端口查找、OOL 消息收发。
// 删去了 SbarLua 用于"接收回调"的服务端实现(mach_server_* / mach_message_callback),
// 本 helper 只做单向发送 + 同步取回应答。
//
// 线协议:命令被打包为「null 分隔的 argv token + 末尾再补一个 '\0'」(双 null 收尾),
// 通过 OOL 描述符发往 sketchybar 在 bootstrap 注册的端口 "git.felix.sketchybar"。
#pragma once

#include <mach/mach.h>
#include <mach/message.h>
#include <bootstrap.h>
#include <cstdlib>
#include <cstring>
#include <cstdbool>

// 与 sketchybar 守护进程约定的消息布局:务必逐字段保持一致。
struct mach_message {
  mach_msg_header_t header;
  mach_msg_size_t msgh_descriptor_count;
  mach_msg_ool_descriptor_t descriptor;
};

struct mach_buffer {
  struct mach_message message;
  mach_msg_trailer_t trailer;
};

// 通过 bootstrap 按名查找目标端口;失败返回 0(端口失效/对端不在)。
static inline mach_port_t mach_get_bs_port(const char* name) {
  mach_port_name_t task = mach_task_self();

  mach_port_t bs_port;
  if (task_get_special_port(task, TASK_BOOTSTRAP_PORT, &bs_port) != KERN_SUCCESS)
    return 0;

  mach_port_t port;
  if (bootstrap_look_up(bs_port, name, &port) != KERN_SUCCESS)
    return 0;

  return port;
}

// 在 response_port 上同步接收一条带超时的应答(1ms),仅用于读回 sketchybar 的回执。
static inline void mach_receive_message(mach_port_t port, struct mach_buffer* buffer) {
  *buffer = (struct mach_buffer){};
  mach_msg_return_t msg_return = mach_msg(&buffer->message.header,
                                          MACH_RCV_MSG | MACH_RCV_TIMEOUT,
                                          0,
                                          sizeof(struct mach_buffer),
                                          port,
                                          1000,
                                          MACH_PORT_NULL);
  if (msg_return != MACH_MSG_SUCCESS)
    buffer->message.descriptor.address = NULL;
}

// 向 port 发送一段 OOL 消息;response=true 时分配临时接收端口并取回应答字符串
// (调用方负责 free)。发送失败返回 NULL —— 这是 helper 判定 sketchybar 失联的信号。
static inline char* mach_send_message(mach_port_t port, char* message, uint32_t len, bool response) {
  if (!message || !port) return NULL;

  mach_port_t response_port = MACH_PORT_NULL;
  mach_port_name_t task = 0;
  if (response) {
    task = mach_task_self();
    if (mach_port_allocate(task, MACH_PORT_RIGHT_RECEIVE, &response_port) != KERN_SUCCESS)
      return NULL;

    if (mach_port_insert_right(task, response_port, response_port,
                               MACH_MSG_TYPE_MAKE_SEND) != KERN_SUCCESS)
      return NULL;
  }

  struct mach_message msg = {};
  msg.header.msgh_remote_port = port;
  if (response) {
    msg.header.msgh_local_port = response_port;
    msg.header.msgh_id = response_port;
  }
  msg.header.msgh_bits = MACH_MSGH_BITS_SET(MACH_MSG_TYPE_COPY_SEND,
                                            MACH_MSG_TYPE_MAKE_SEND,
                                            0,
                                            MACH_MSGH_BITS_COMPLEX);
  msg.header.msgh_size = sizeof(struct mach_message);
  msg.msgh_descriptor_count = 1;
  msg.descriptor.address = message;
  msg.descriptor.size = len * sizeof(char);
  msg.descriptor.copy = MACH_MSG_VIRTUAL_COPY;
  msg.descriptor.deallocate = false;
  msg.descriptor.type = MACH_MSG_OOL_DESCRIPTOR;

  mach_msg_return_t ret = mach_msg(&msg.header,
                                   MACH_SEND_MSG,
                                   sizeof(struct mach_message),
                                   0,
                                   MACH_PORT_NULL,
                                   MACH_MSG_TIMEOUT_NONE,
                                   MACH_PORT_NULL);
  if (ret != KERN_SUCCESS) {
    if (response) {
      mach_port_mod_refs(task, response_port, MACH_PORT_RIGHT_RECEIVE, -1);
      mach_port_deallocate(task, response_port);
    }
    return NULL;
  }

  char* rsp = NULL;
  if (response) {
    struct mach_buffer buffer = {};
    mach_receive_message(response_port, &buffer);

    if (buffer.message.descriptor.address) {
      size_t n = strlen((char*)buffer.message.descriptor.address);
      rsp = (char*)malloc(n + 1);
      memcpy(rsp, buffer.message.descriptor.address, n + 1);
      mach_msg_destroy(&buffer.message.header);
    } else {
      rsp = (char*)malloc(1);
      *rsp = '\0';
    }

    mach_port_mod_refs(task, response_port, MACH_PORT_RIGHT_RECEIVE, -1);
    mach_port_deallocate(task, response_port);
  }

  return rsp;
}
