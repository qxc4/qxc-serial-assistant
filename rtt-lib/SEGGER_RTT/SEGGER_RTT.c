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
---------------------------END-OF-HEADER------------------------------
File    : SEGGER_RTT.c
Purpose : Implementation of SEGGER real-time transfer which allows
          real-time communication from targets to host.
Revision: $Rev: 25842 $
----------------------------------------------------------------------
*/

#include "SEGGER_RTT.h"

#include <string.h>
#include "SEGGER_RTT_Conf.h"

/*********************************************************************
*
*       Defines, fixed
*
**********************************************************************
*/
#define RTT__RB_POINTER_GET(pRingBuffer)    ((pRingBuffer)->WrOff)
#define RTT__RB_POINTER_SET(pRingBuffer, v) (pRingBuffer)->WrOff = (v)
#define RTT__RB_SIZEOF_GET(pRingBuffer)     ((pRingBuffer)->SizeOfBuffer)
#define RTT__RB_SIZEOF_SET(pRingBuffer, v)  (pRingBuffer)->SizeOfBuffer = (v)

/*********************************************************************
*
*       Static data
*
**********************************************************************
*/
//
// Allocate buffers for channel 0
//
#if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 0
static char _acUpBuffer  [BUFFER_SIZE_UP];
#endif
#if SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 0
static char _acDownBuffer[BUFFER_SIZE_DOWN];
#endif

//
// Initialize SEGGER Real-Time-Terminal control block (Ring buffer descriptors)
//
#if (SEGGER_RTT_MAX_NUM_UP_BUFFERS > 0) || (SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 0)
SEGGER_RTT_CB _SEGGER_RTT = {
  "SEGGER RTT",                      // acID
  SEGGER_RTT_MAX_NUM_UP_BUFFERS,     // MaxNumUpBuffers
  SEGGER_RTT_MAX_NUM_DOWN_BUFFERS,   // MaxNumDownBuffers
  #if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 0
    {
      #if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 0
        {
          "Terminal",                  // sName
          &_acUpBuffer[0],             // pBuffer
          BUFFER_SIZE_UP,              // SizeOfBuffer
          0u,                          // WrOff
          0u,                          // RdOff
          0u                           // Flags
        },
      #endif
      #if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 1
        { NULL, NULL, 0, 0, 0, 0 },
      #endif
      #if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 2
        { NULL, NULL, 0, 0, 0, 0 },
      #endif
      #if SEGGER_RTT_MAX_NUM_UP_BUFFERS > 3
        { NULL, NULL, 0, 0, 0, 0 },
      #endif
    },
  #else
    { { NULL, NULL, 0, 0, 0, 0 } },
  #endif
  #if SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 0
    {
      #if SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 0
        {
          "Terminal",                  // sName
          &_acDownBuffer[0],           // pBuffer
          BUFFER_SIZE_DOWN,            // SizeOfBuffer
          0u,                          // WrOff
          0u,                          // RdOff
          0u                           // Flags
        },
      #endif
      #if SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 1
        { NULL, NULL, 0, 0, 0, 0 },
      #endif
      #if SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 2
        { NULL, NULL, 0, 0, 0, 0 },
      #endif
      #if SEGGER_RTT_MAX_NUM_DOWN_BUFFERS > 3
        { NULL, NULL, 0, 0, 0, 0 },
      #endif
    },
  #else
    { { NULL, NULL, 0, 0, 0, 0 } },
  #endif
  #if SEGGER_RTT__CB_PADDING
    { 0 }
  #endif
};
#else
SEGGER_RTT_CB _SEGGER_RTT;
#endif

/*********************************************************************
*
*       Static functions
*
**********************************************************************
*/

/*********************************************************************
*
*       _WriteBlocking()
*
*  Function description
*    Stores a specified number of characters in SEGGER RTT ring buffer
*    which will be then read by the host.
*    This function is blocking, so it will wait until the data can be stored.
*
*  Parameters
*    pRingBuffer  Ring buffer to write to.
*    pBuffer      Data to store.
*    NumBytes     Number of bytes to store.
*
*  Return value
*    Number of bytes that have been stored in the ring buffer.
*/
static unsigned _WriteBlocking(SEGGER_RTT_BUFFER_UP* pRingBuffer, const char* pBuffer, unsigned NumBytes) {
  unsigned NumBytesToWrite;
  unsigned NumBytesWritten;
  unsigned RdOff;
  unsigned WrOff;
#if SEGGER_RTT_CPU_CACHE_LINE_SIZE
  volatile char* pWr;
#endif
  //
  // Write data to buffer and handle wrap-around if necessary
  //
  NumBytesWritten = 0u;
  WrOff = pRingBuffer->WrOff;
  do {
    RdOff = pRingBuffer->RdOff;                         // May be changed by host (concurrent read)
    if (RdOff <= WrOff) {
      NumBytesToWrite = SEGGER_RTT__RB_SIZEOF_GET(pRingBuffer) - 1u - WrOff;      // Maximum number of bytes that can be written without wrap-around
      if (NumBytesToWrite > NumBytes - NumBytesWritten) {
        NumBytesToWrite = NumBytes - NumBytesWritten;
      }
    } else {
      NumBytesToWrite = RdOff - WrOff - 1u;
      if (NumBytesToWrite > NumBytes - NumBytesWritten) {
        NumBytesToWrite = NumBytes - NumBytesWritten;
      }
    }
    //
    // Output data
    //
    if (NumBytesToWrite) {
#if SEGGER_RTT_CPU_CACHE_LINE_SIZE
      pWr = pRingBuffer->pBuffer + WrOff;
      memcpy((void*)pWr, pBuffer + NumBytesWritten, NumBytesToWrite);
      if (SEGGER_RTT_CPU_CACHE_LINE_SIZE) {
        SEGGER_RTT__CB_CACHE_FLUSH(pWr, NumBytesToWrite);
      }
#else
      memcpy(pRingBuffer->pBuffer + WrOff, pBuffer + NumBytesWritten, NumBytesToWrite);
#endif
      NumBytesWritten += NumBytesToWrite;
      WrOff          += NumBytesToWrite;
      if (WrOff == SEGGER_RTT__RB_SIZEOF_GET(pRingBuffer)) {
        WrOff = 0u;
      }
      RTT__RB_POINTER_SET(pRingBuffer, WrOff);
    }
  } while (NumBytesWritten < NumBytes);
  //
  return NumBytesWritten;
}

/*********************************************************************
*
*       _WriteNoCheck()
*
*  Function description
*    Stores a specified number of characters in SEGGER RTT ring buffer
*    which will be then read by the host.
*    This function does not check for wrap-around or buffer full.
*
*  Parameters
*    pRingBuffer  Ring buffer to write to.
*    pBuffer      Data to store.
*    NumBytes     Number of bytes to store.
*
*  Return value
*    Number of bytes that have been stored in the ring buffer.
*/
static unsigned _WriteNoCheck(SEGGER_RTT_BUFFER_UP* pRingBuffer, const char* pBuffer, unsigned NumBytes) {
  unsigned WrOff;
#if SEGGER_RTT_CPU_CACHE_LINE_SIZE
  volatile char* pWr;
#endif
  //
  // Write data to buffer and handle wrap-around if necessary
  //
  WrOff = pRingBuffer->WrOff;
#if SEGGER_RTT_CPU_CACHE_LINE_SIZE
  pWr = pRingBuffer->pBuffer + WrOff;
  memcpy((void*)pWr, pBuffer, NumBytes);
  if (SEGGER_RTT_CPU_CACHE_LINE_SIZE) {
    SEGGER_RTT__CB_CACHE_FLUSH(pWr, NumBytes);
  }
#else
  memcpy(pRingBuffer->pBuffer + WrOff, pBuffer, NumBytes);
#endif
  WrOff += NumBytes;
  if (WrOff >= SEGGER_RTT__RB_SIZEOF_GET(pRingBuffer)) {
    WrOff -= SEGGER_RTT__RB_SIZEOF_GET(pRingBuffer);
  }
  RTT__RB_POINTER_SET(pRingBuffer, WrOff);
  //
  return NumBytes;
}

/*********************************************************************
*
*       Public code
*
**********************************************************************
*/

/*********************************************************************
*
*       SEGGER_RTT_Init()
*
*  Function description
*    Initializes the RTT Control Block.
*    Should be called in the startup of the application.
*/
void SEGGER_RTT_Init (void) {
  _SEGGER_RTT.acID[0] = 'S';
  _SEGGER_RTT.acID[1] = 'E';
  _SEGGER_RTT.acID[2] = 'G';
  _SEGGER_RTT.acID[3] = 'G';
  _SEGGER_RTT.acID[4] = 'E';
  _SEGGER_RTT.acID[5] = 'R';
  _SEGGER_RTT.acID[6] = ' ';
  _SEGGER_RTT.acID[7] = 'R';
  _SEGGER_RTT.acID[8] = 'T';
  _SEGGER_RTT.acID[9] = 'T';
  _SEGGER_RTT.acID[10] = '\0';
}

/*********************************************************************
*
*       SEGGER_RTT_Write()
*
*  Function description
*    Stores a specified number of characters in SEGGER RTT ring buffer
*    which will be then read by the host.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used (e.g. 0 for "Terminal").
*    pBuffer      Pointer to character array. Does not need to point to a \0 terminated string.
*    NumBytes     Number of bytes to be stored in the SEGGER RTT control block.
*
*  Return value
*    Number of bytes which have been stored in the "Up"-buffer.
*
*  Notes
*    (1) Data is stored according to buffer flags.
*/
unsigned SEGGER_RTT_Write (unsigned BufferIndex, const void* pBuffer, unsigned NumBytes) {
  unsigned NumBytesWritten;
  //
  // Call the non-locking write function
  //
  NumBytesWritten = SEGGER_RTT_WriteNoLock(BufferIndex, pBuffer, NumBytes);
  //
  return NumBytesWritten;
}

/*********************************************************************
*
*       SEGGER_RTT_WriteNoLock()
*
*  Function description
*    Stores a specified number of characters in SEGGER RTT ring buffer
*    which will be then read by the host.
*    SEGGER_RTT_WriteNoLock does not lock the application.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used (e.g. 0 for "Terminal").
*    pBuffer      Pointer to character array. Does not need to point to a \0 terminated string.
*    NumBytes     Number of bytes to be stored in the SEGGER RTT control block.
*
*  Return value
*    Number of bytes which have been stored in the "Up"-buffer.
*/
unsigned SEGGER_RTT_WriteNoLock (unsigned BufferIndex, const void* pBuffer, unsigned NumBytes) {
  unsigned            Status;
  unsigned            Avail;
  unsigned            WrOff;
  unsigned            RdOff;
  SEGGER_RTT_BUFFER_UP* pRing;
  //
  // Get "Up"-buffer
  //
  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumUpBuffers) {
    pRing = &_SEGGER_RTT.aUp[BufferIndex];
    Status = pRing->Flags;
    //
    // Check if we are in blocking mode
    //
    if ((Status & SEGGER_RTT_MODE_MASK) == SEGGER_RTT_MODE_BLOCK_IF_FIFO_FULL) {
      //
      // Write until we have the complete string in the buffer
      //
      do {
        Avail = SEGGER_RTT_GetAvailWriteSpace(BufferIndex);
        if (Avail >= NumBytes) {
          Status = _WriteBlocking(pRing, (const char*)pBuffer, NumBytes);
          break;
        }
        Status = _WriteBlocking(pRing, (const char*)pBuffer, Avail);
        pBuffer   = (const char*)pBuffer + Avail;
        NumBytes -= Avail;
      } while (NumBytes);
    } else {
      //
      // Check if we are in trim mode
      //
      if ((Status & SEGGER_RTT_MODE_MASK) == SEGGER_RTT_MODE_NO_BLOCK_TRIM) {
        //
        // Trim the string to what fits into the buffer
        //
        Avail = SEGGER_RTT_GetAvailWriteSpace(BufferIndex);
        if (Avail < NumBytes) {
          NumBytes = Avail;
        }
      }
      //
      // Write data to buffer
      //
      if (NumBytes) {
        WrOff = pRing->WrOff;
        RdOff = pRing->RdOff;
        if (RdOff <= WrOff) {
          Avail = pRing->SizeOfBuffer - 1u - WrOff;
          if (Avail >= NumBytes) {
            memcpy(pRing->pBuffer + WrOff, pBuffer, NumBytes);
            pRing->WrOff = WrOff + NumBytes;
          } else {
            memcpy(pRing->pBuffer + WrOff, pBuffer, Avail);
            memcpy(pRing->pBuffer, (const char*)pBuffer + Avail, NumBytes - Avail);
            pRing->WrOff = NumBytes - Avail;
          }
        } else {
          Avail = RdOff - WrOff - 1u;
          if (Avail >= NumBytes) {
            memcpy(pRing->pBuffer + WrOff, pBuffer, NumBytes);
            pRing->WrOff = WrOff + NumBytes;
          } else {
            memcpy(pRing->pBuffer + WrOff, pBuffer, Avail);
            pRing->WrOff = WrOff + Avail;
          }
        }
      }
    }
  } else {
    Status = 0u;
  }
  //
  return Status;
}

/*********************************************************************
*
*       SEGGER_RTT_WriteString()
*
*  Function description
*    Stores string in SEGGER RTT ring buffer.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used (e.g. 0 for "Terminal").
*    s            Pointer to string.
*
*  Return value
*    Number of bytes which have been stored in the "Up"-buffer.
*/
unsigned SEGGER_RTT_WriteString (unsigned BufferIndex, const char* s) {
  unsigned Len;

  Len = STRLEN(s);
  return SEGGER_RTT_Write(BufferIndex, s, Len);
}

/*********************************************************************
*
*       SEGGER_RTT_GetAvailWriteSpace()
*
*  Function description
*    Returns the number of bytes that can be written to the ring buffer
*    without blocking.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used.
*
*  Return value
*    Number of bytes that are free in the buffer.
*/
unsigned SEGGER_RTT_GetAvailWriteSpace (unsigned BufferIndex) {
  unsigned RdOff;
  unsigned WrOff;
  unsigned Avail;
  SEGGER_RTT_BUFFER_UP* pRing;

  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumUpBuffers) {
    pRing = &_SEGGER_RTT.aUp[BufferIndex];
    RdOff = pRing->RdOff;
    WrOff = pRing->WrOff;
    if (RdOff <= WrOff) {
      Avail = pRing->SizeOfBuffer - 1u - WrOff + RdOff;
    } else {
      Avail = RdOff - WrOff - 1u;
    }
  } else {
    Avail = 0u;
  }
  return Avail;
}

/*********************************************************************
*
*       SEGGER_RTT_Read()
*
*  Function description
*    Reads characters from SEGGER real-time terminal control block.
*
*  Parameters
*    BufferIndex  Index of "Down"-buffer to be used (e.g. 0 for "Terminal").
*    pBuffer      Pointer to character array. Does not need to point to a \0 terminated string.
*    BufferSize   Size of the buffer.
*
*  Return value
*    Number of bytes which have been read.
*/
unsigned SEGGER_RTT_Read (unsigned BufferIndex, void* pBuffer, unsigned BufferSize) {
  unsigned NumBytesRead;
  //
  // Call the non-locking read function
  //
  NumBytesRead = SEGGER_RTT_ReadNoLock(BufferIndex, pBuffer, BufferSize);
  //
  return NumBytesRead;
}

/*********************************************************************
*
*       SEGGER_RTT_ReadNoLock()
*
*  Function description
*    Reads characters from SEGGER real-time terminal control block.
*    SEGGER_RTT_ReadNoLock does not lock the application.
*
*  Parameters
*    BufferIndex  Index of "Down"-buffer to be used (e.g. 0 for "Terminal").
*    pData        Pointer to character array. Does not need to point to a \0 terminated string.
*    BufferSize   Size of the buffer.
*
*  Return value
*    Number of bytes which have been read.
*/
unsigned SEGGER_RTT_ReadNoLock (unsigned BufferIndex, void* pData, unsigned BufferSize) {
  unsigned            NumBytesRead;
  unsigned            RdOff;
  unsigned            WrOff;
  unsigned            Rem;
  SEGGER_RTT_BUFFER_DOWN* pRing;

  //
  // Get "Down"-buffer
  //
  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumDownBuffers) {
    pRing = &_SEGGER_RTT.aDown[BufferIndex];
    RdOff = pRing->RdOff;
    WrOff = pRing->WrOff;
    NumBytesRead = 0u;
    //
    // Read from buffer
    //
    if (RdOff != WrOff) {
      Rem = pRing->SizeOfBuffer - RdOff;
      if (Rem > BufferSize) {
        memcpy(pData, pRing->pBuffer + RdOff, BufferSize);
        pRing->RdOff = RdOff + BufferSize;
        NumBytesRead = BufferSize;
      } else {
        memcpy(pData, pRing->pBuffer + RdOff, Rem);
        NumBytesRead = Rem;
        if (BufferSize > Rem) {
          Rem = BufferSize - Rem;
          if (Rem > WrOff) {
            Rem = WrOff;
          }
          memcpy((char*)pData + NumBytesRead, pRing->pBuffer, Rem);
          NumBytesRead += Rem;
          pRing->RdOff = Rem;
        } else {
          pRing->RdOff = 0u;
        }
      }
    }
  } else {
    NumBytesRead = 0u;
  }
  //
  return NumBytesRead;
}

/*********************************************************************
*
*       SEGGER_RTT_HasData()
*
*  Function description
*    Checks if there is data available in the given "Down"-buffer.
*
*  Parameters
*    BufferIndex  Index of "Down"-buffer to be used.
*
*  Return value
*    1:       Data available
*    0:       No data available
*/
unsigned SEGGER_RTT_HasData (unsigned BufferIndex) {
  SEGGER_RTT_BUFFER_DOWN* pRing;
  unsigned                v;

  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumDownBuffers) {
    pRing = &_SEGGER_RTT.aDown[BufferIndex];
    v = pRing->WrOff;
    return (v != pRing->RdOff);
  } else {
    return 0u;
  }
}

/*********************************************************************
*
*       SEGGER_RTT_HasKey()
*
*  Function description
*    Checks if at least one character for reading is available in the SEGGER RTT buffer.
*
*  Return value
*  1: At least one character is available.
*  0: No character is available.
*/
int SEGGER_RTT_HasKey (void) {
  return SEGGER_RTT_HasData(0);
}

/*********************************************************************
*
*       SEGGER_RTT_GetKey()
*
*  Function description
*    Reads one character from the SEGGER RTT buffer.
*
*  Return value
*    The character which has been read.
*    0:       No character available (buffer empty).
*/
int SEGGER_RTT_GetKey (void) {
  char c;
  int r;

  r = (int)SEGGER_RTT_Read(0u, &c, 1u);
  if (r == 1) {
    r = (int)(unsigned char)c;
  } else {
    r = -1;
  }
  return r;
}

/*********************************************************************
*
*       SEGGER_RTT_WaitKey()
*
*  Function description
*    Waits until at least one character is available in the SEGGER RTT buffer.
*
*  Return value
*    The character which has been read.
*/
int SEGGER_RTT_WaitKey (void) {
  int r;

  while (1) {
    r = SEGGER_RTT_GetKey();
    if (r >= 0) {
      break;
    }
  }
  return r;
}

/*********************************************************************
*
*       SEGGER_RTT_PutChar()
*
*  Function description
*    Stores a single character in SEGGER RTT buffer.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used (e.g. 0 for "Terminal").
*    c            Character to be stored.
*
*  Return value
*    Number of bytes which have been stored in the "Up"-buffer.
*/
unsigned SEGGER_RTT_PutChar (unsigned BufferIndex, char c) {
  SEGGER_RTT_BUFFER_UP* pRing;
  unsigned WrOff;
  unsigned RdOff;
  unsigned Rem;
  unsigned Status;

  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumUpBuffers) {
    pRing = &_SEGGER_RTT.aUp[BufferIndex];
    WrOff = pRing->WrOff;
    RdOff = pRing->RdOff;
    if (RdOff <= WrOff) {
      Rem = pRing->SizeOfBuffer - WrOff;
      if (Rem > 1u) {
        pRing->pBuffer[WrOff] = c;
        pRing->WrOff = WrOff + 1u;
        Status = 1u;
      } else {
        if (RdOff > 0u) {
          pRing->pBuffer[0] = c;
          pRing->WrOff = 1u;
          Status = 1u;
        } else {
          Status = 0u;
        }
      }
    } else {
      Rem = RdOff - WrOff;
      if (Rem > 1u) {
        pRing->pBuffer[WrOff] = c;
        pRing->WrOff = WrOff + 1u;
        Status = 1u;
      } else {
        Status = 0u;
      }
    }
  } else {
    Status = 0u;
  }
  return Status;
}

/*********************************************************************
*
*       SEGGER_RTT_PutCharSkip()
*
*  Function description
*    Stores a single character in SEGGER RTT buffer.
*    If the buffer is full, the character is skipped.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used (e.g. 0 for "Terminal").
*    c            Character to be stored.
*
*  Return value
*    Number of bytes which have been stored in the "Up"-buffer.
*/
unsigned SEGGER_RTT_PutCharSkip (unsigned BufferIndex, char c) {
  return SEGGER_RTT_PutCharSkipNoLock(BufferIndex, c);
}

/*********************************************************************
*
*       SEGGER_RTT_PutCharSkipNoLock()
*
*  Function description
*    Stores a single character in SEGGER RTT buffer.
*    If the buffer is full, the character is skipped.
*    SEGGER_RTT_PutCharSkipNoLock does not lock the application.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used (e.g. 0 for "Terminal").
*    c            Character to be stored.
*
*  Return value
*    Number of bytes which have been stored in the "Up"-buffer.
*/
unsigned SEGGER_RTT_PutCharSkipNoLock (unsigned BufferIndex, char c) {
  SEGGER_RTT_BUFFER_UP* pRing;
  unsigned WrOff;
  unsigned RdOff;
  unsigned Rem;
  unsigned Status;

  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumUpBuffers) {
    pRing = &_SEGGER_RTT.aUp[BufferIndex];
    WrOff = pRing->WrOff;
    RdOff = pRing->RdOff;
    if (RdOff <= WrOff) {
      Rem = pRing->SizeOfBuffer - WrOff;
      if (Rem > 1u) {
        pRing->pBuffer[WrOff] = c;
        pRing->WrOff = WrOff + 1u;
        Status = 1u;
      } else {
        if (RdOff > 0u) {
          pRing->pBuffer[0] = c;
          pRing->WrOff = 1u;
          Status = 1u;
        } else {
          Status = 0u;
        }
      }
    } else {
      Rem = RdOff - WrOff;
      if (Rem > 1u) {
        pRing->pBuffer[WrOff] = c;
        pRing->WrOff = WrOff + 1u;
        Status = 1u;
      } else {
        Status = 0u;
      }
    }
  } else {
    Status = 0u;
  }
  return Status;
}

/*********************************************************************
*
*       SEGGER_RTT_GetBytesInBuffer()
*
*  Function description
*    Returns the number of bytes currently used in the up-buffer.
*
*  Parameters
*    BufferIndex  Index of "Up"-buffer to be used.
*
*  Return value
*    Number of bytes currently used in the up-buffer.
*/
unsigned SEGGER_RTT_GetBytesInBuffer(unsigned BufferIndex) {
  unsigned RdOff;
  unsigned WrOff;
  unsigned NumBytes;
  SEGGER_RTT_BUFFER_UP* pRing;

  if (BufferIndex < (unsigned)_SEGGER_RTT.MaxNumUpBuffers) {
    pRing = &_SEGGER_RTT.aUp[BufferIndex];
    RdOff = pRing->RdOff;
    WrOff = pRing->WrOff;
    if (RdOff <= WrOff) {
      NumBytes = WrOff - RdOff;
    } else {
      NumBytes = pRing->SizeOfBuffer - RdOff + WrOff;
    }
  } else {
    NumBytes = 0u;
  }
  return NumBytes;
}

/*************************** End of file ****************************/
