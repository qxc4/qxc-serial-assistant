/*********************************************************************
*                    SEGGER Microcontroller GmbH                     *
*                        The Embedded Experts                        *
**********************************************************************
*                                                                    *
*            (c) 1995 - 2021 SEGGER Microcontroller GmbH             *
*                                                                    *
*       www.segger.com     Support: support@segger.com               *
*                                                                    *
**********************************************************************
*                                                                    *
*       SEGGER RTT * Real Time Transfer for embedded targets         *
*                                                                    *
**********************************************************************
*                                                                    *
* All rights reserved.                                               *
*                                                                    *
* SEGGER strongly recommends to not make any changes                 *
* to or modify the source code of this software in order to stay     *
* compatible with the RTT protocol and J-Link.                       *
*                                                                    *
* Redistribution and use in source and binary forms, with or         *
* without modification, are permitted provided that the following    *
* condition is met:                                                  *
*                                                                    *
* o Redistributions of source code must retain the above copyright   *
*   notice, this condition and the following disclaimer.             *
*                                                                    *
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND             *
* CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,        *
* INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF           *
* MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE           *
* DISCLAIMED. IN NO EVENT SHALL SEGGER Microcontroller BE LIABLE FOR *
* ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR           *
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT *
* OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;    *
* OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF      *
* LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT          *
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE  *
* USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH   *
* DAMAGE.                                                            *
*                                                                    *
**********************************************************************
---------------------------END-OF-HEADER------------------------------
File    : SEGGER_RTT_Conf.h
Purpose : Implementation of SEGGER real-time transfer (RTT) which
          allows real-time communication from targets to host.
Revision: $Rev: 24316 $

*/

#ifndef SEGGER_RTT_CONF_H
#define SEGGER_RTT_CONF_H

#ifdef __IAR_SYSTEMS_ICC__
  #include <intrinsics.h>
#endif

/*********************************************************************
*
*       Defines, configurable
*
**********************************************************************
*/

//
// Take in and set to correct values for Cortex-A systems with CPU cache
//
//#define SEGGER_RTT_CPU_CACHE_LINE_SIZE            (32)          // Largest cache line size (in bytes) in the current system
//#define SEGGER_RTT_UNCACHED_OFF                   (0xFB000000)  // Address alias where RTT CB and buffers can be accessed uncached
//
// Most common setup:
#define SEGGER_RTT_CPU_CACHE_LINE_SIZE            (0)            // Largest cache line size (in bytes) in the current system
#define SEGGER_RTT_UNCACHED_OFF                   (0)            // Address alias where RTT CB and buffers can be accessed uncached

/*********************************************************************
*
*   RTT buffer sizes
*/
//
// Number of up-buffers (T->H) available on the target
//
#ifndef   SEGGER_RTT_MAX_NUM_UP_BUFFERS
  #define SEGGER_RTT_MAX_NUM_UP_BUFFERS             (3)     // Max. number of up-buffers (T->H) available on target
#endif

//
// Number of down-buffers (H->T) available on the target
//
#ifndef   SEGGER_RTT_MAX_NUM_DOWN_BUFFERS
  #define SEGGER_RTT_MAX_NUM_DOWN_BUFFERS           (3)     // Max. number of down-buffers (H->T) available on target
#endif

/*********************************************************************
*
*   Buffer sizes (0 for no buffer)
*/
//
// Size of the buffer for terminal output of target, up to host
// (Default: 1k)
//
#ifndef   BUFFER_SIZE_UP
  #define BUFFER_SIZE_UP                            (1024)  // Size of the buffer for terminal output of target, up to host
#endif

//
// Size of the buffer for terminal input to target from host (Usually keyboard input)
// (Default: 16)
//
#ifndef   BUFFER_SIZE_DOWN
  #define BUFFER_SIZE_DOWN                          (16)    // Size of the buffer for terminal input to target from host (Usually keyboard input)
#endif

/*********************************************************************
*
*   RTT memcpy configuration
*
*   memcpy() is good for large amounts of data,
*   but the overhead is big for small amounts, which are usually stored via RTT.
*   With RTT_MEMCPY_USE_BYTELOOP a simple byte loop can be used instead.
*
*/
#ifndef   SEGGER_RTT_MEMCPY_USE_BYTELOOP
  #define SEGGER_RTT_MEMCPY_USE_BYTELOOP            (0)  // 0: Use memcpy/SEGGER_RTT_MEMCPY; 1: Use a simple byte-loop
#endif

//
// Example definition of SEGGER_RTT_MEMCPY to external memcpy with GCC toolchains and Cortex-A targets.
//
//#if ((defined __SES_ARM) || (defined __CROSSWORKS_ARM) || (defined __GNUC__)) && (defined (__ARM_ARCH_7A__))
//  #define SEGGER_RTT_MEMCPY(pDest, pSrc, NumBytes)      SEGGER_memcpy((pDest), (pSrc), (NumBytes))
//#endif

//
// Target is not allowed to perform other RTT operations while string to be written is longer than buffer size.
// This avoids inconsistent output on the host side when the buffer is filled with data from multiple writes.
// If this define is set to 1, the target will block until the whole string has been written.
// Recommended: Set to 1 only if you have a lot of data to output and cannot guarantee that the buffer is big enough.
//
#ifndef   SEGGER_RTT_LOCK_INTERRUPTS
  #define SEGGER_RTT_LOCK_INTERRUPTS                (0)  // 0: Do not lock interrupts; 1: Lock interrupts
#endif

/*********************************************************************
*
*       RTT lock configuration for SEGGER_RTT_MAX_NUM_UP_BUFFERS > 1
*/
#if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 1
  #ifndef   SEGGER_RTT_LOCK
    #define SEGGER_RTT_LOCK()   SEGGER_RTT_Lock()
  #endif
  #ifndef   SEGGER_RTT_UNLOCK
    #define SEGGER_RTT_UNLOCK() SEGGER_RTT_Unlock()
  #endif
#else
  #ifndef   SEGGER_RTT_LOCK
    #define SEGGER_RTT_LOCK()
  #endif
  #ifndef   SEGGER_RTT_UNLOCK
    #define SEGGER_RTT_UNLOCK()
  #endif
#endif

/*********************************************************************
*
*       RTT lock configuration fallback
*/
#ifndef   SEGGER_RTT_LOCK
  #if defined(__SES_ARM) || defined(__CROSSWORKS_ARM) || defined(__GNUC__) || defined(__clang__)
    #if defined(__ARM_ARCH_6M__) || defined(__ARM_ARCH_8M_BASE__)
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                               \
                                  __asm volatile ("mrs   %0, primask  \n\t"                             \
                                                  "movs  r1, #1       \n\t"                             \
                                                  "msr   primask, r1  \n\t"                             \
                                                  : "=r" (_SEGGER_RTT__LockState)                                \
                                                  :                                                 \
                                                  : "r1", "cc"                                        \
                                                  );

      #define SEGGER_RTT_UNLOCK()   __asm volatile ("msr   primask, %0  \n\t"                             \
                                                  :                                                 \
                                                  : "r" (_SEGGER_RTT__LockState)                                \
                                                  :                                                 \
                                                  );                                                \
                                  }
    #elif defined(__ARM_ARCH_7M__) || defined(__ARM_ARCH_7EM__) || defined(__ARM_ARCH_8M_MAIN__)
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                               \
                                  __asm volatile ("mrs   %0, basepri  \n\t"                             \
                                                  "movs  r1, %1       \n\t"                             \
                                                  "msr   basepri, r1  \n\t"                             \
                                                  : "=r" (_SEGGER_RTT__LockState)                                \
                                                  : "i"(SEGGER_RTT_MAX_PRIO)                          \
                                                  : "r1", "cc"                                        \
                                                  );

      #define SEGGER_RTT_UNLOCK()   __asm volatile ("msr   basepri, %0  \n\t"                             \
                                                  :                                                 \
                                                  : "r" (_SEGGER_RTT__LockState)                                \
                                                  :                                                 \
                                                  );                                                \
                                  }
    #elif defined(__ARM_ARCH_7A__)
      #define SEGGER_RTT_LOCK() {                                                \
                                 unsigned int _SEGGER_RTT__LockState;                       \
                                 __asm volatile ("mrs r1, CPSR \n\t"           \
                                                 "mov %0, r1 \n\t"             \
                                                 "orr r1, r1, #0xC0 \n\t"      \
                                                 "msr CPSR_c, r1 \n\t"         \
                                                 : "=r" (_SEGGER_RTT__LockState)            \
                                                 :                             \
                                                 : "r1", "cc"                  \
                                                 );

      #define SEGGER_RTT_UNLOCK() __asm volatile ("mov r0, %0 \n\t"              \
                                                "mrs r1, CPSR \n\t"            \
                                                "bic r1, r1, #0xC0 \n\t"       \
                                                "and r0, r0, #0xC0 \n\t"       \
                                                "orr r1, r1, r0 \n\t"          \
                                                "msr CPSR_c, r1 \n\t"          \
                                                :                              \
                                                : "r" (_SEGGER_RTT__LockState)              \
                                                : "r0", "r1", "cc"             \
                                                );                             \
                                }
    #endif
  #elif defined(__ICCARM__)
    #if defined(__ARM6M__) || defined(__ARM8M_BASE__)
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                                           \
                                  _SEGGER_RTT__LockState = __get_PRIMASK();                                      \
                                  __set_PRIMASK(1);

      #define SEGGER_RTT_UNLOCK()   __set_PRIMASK(_SEGGER_RTT__LockState);                                         \
                                  }
    #elif defined(__ARM7EM__) || defined(__ARM7M__) || defined(__ARM8M_MAIN__)
      #ifndef   SEGGER_RTT_MAX_PRIO
        #define SEGGER_RTT_MAX_PRIO   (0x20)
      #endif
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                                           \
                                  _SEGGER_RTT__LockState = __get_BASEPRI();                                      \
                                  __set_BASEPRI(SEGGER_RTT_MAX_PRIO);

      #define SEGGER_RTT_UNLOCK()   __set_BASEPRI(_SEGGER_RTT__LockState);                                         \
                                  }
    #endif
  #elif defined(__CC_ARM) || defined(__ARMCC_VERSION)
    #if defined(__TARGET_ARCH_6S_M)
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                                           \
                                  register unsigned char _SEGGER_RTT__PRIMASK __asm( "primask");                 \
                                  _SEGGER_RTT__LockState = _SEGGER_RTT__PRIMASK;                                              \
                                  _SEGGER_RTT__PRIMASK = 1u;

      #define SEGGER_RTT_UNLOCK()   _SEGGER_RTT__PRIMASK = _SEGGER_RTT__LockState;                                              \
                                  }
    #elif defined(__TARGET_ARCH_7_M) || defined(__TARGET_ARCH_7E_M)
      #ifndef   SEGGER_RTT_MAX_PRIO
        #define SEGGER_RTT_MAX_PRIO   (0x20)
      #endif
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                                           \
                                  register unsigned char _SEGGER_RTT__BASEPRI __asm( "basepri");                 \
                                  _SEGGER_RTT__LockState = _SEGGER_RTT__BASEPRI;                                              \
                                  _SEGGER_RTT__BASEPRI = SEGGER_RTT_MAX_PRIO;                                                \
                                  }

      #define SEGGER_RTT_UNLOCK()   _SEGGER_RTT__BASEPRI = _SEGGER_RTT__LockState;                                              \
                                  }
    #endif
  #elif defined(__TI_ARM__)
    #if defined (__TI_ARM_V6M0__)
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                                           \
                                  _SEGGER_RTT__LockState = __get_PRIMASK();                                      \
                                  __set_PRIMASK(1);

      #define SEGGER_RTT_UNLOCK()   __set_PRIMASK(_SEGGER_RTT__LockState);                                         \
                                  }
    #elif defined (__TI_ARM_V7M3__) || defined (__TI_ARM_V7M4__)
      #ifndef   SEGGER_RTT_MAX_PRIO
        #define SEGGER_RTT_MAX_PRIO   (0x20)
      #endif
      #define SEGGER_RTT_LOCK()   {                                                                   \
                                    unsigned int _SEGGER_RTT__LockState;                                           \
                                  _SEGGER_RTT__LockState = _set_interrupt_priority(SEGGER_RTT_MAX_PRIO);

      #define SEGGER_RTT_UNLOCK()   _set_interrupt_priority(_SEGGER_RTT__LockState);                              \
                                  }
    #endif
  #endif
#endif

#ifndef   SEGGER_RTT_MAX_PRIO
  #define SEGGER_RTT_MAX_PRIO   (0x20)         // Deafult: Interrupts with priority 0x00-0x1F are locked
#endif

#ifndef   SEGGER_RTT_LOCK
  #define SEGGER_RTT_LOCK()                // Lock RTT (nestable)   (i.e. disable interrupts)
#endif

#ifndef   SEGGER_RTT_UNLOCK
  #define SEGGER_RTT_UNLOCK()              // Unlock RTT (nestable) (i.e. enable previous interrupt lock state)
#endif

/*********************************************************************
*
*       RTT cb padding
*/
#ifndef SEGGER_RTT__CB_PADDING
  #define SEGGER_RTT__CB_PADDING (0)
#endif

#endif
/*************************** End of file ****************************/
