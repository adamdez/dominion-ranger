'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Device } from '@twilio/voice-sdk';
import api from '@/lib/api';
import type { DialerTokenResponse } from '@/lib/types';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error';

export function useTwilioDevice() {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<unknown>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    callRef.current = null;
    setCallDuration(0);
    setIsMuted(false);
    setActiveCallSid(null);
  }, []);

  const initDevice = useCallback(async () => {
    try {
      const { data } = await api.get<DialerTokenResponse>('/api/dialer/token');

      if ('error' in data) {
        setError((data as unknown as { message: string }).message);
        return;
      }

      const { Device: TwilioDevice, Call: TwilioCall } = await import('@twilio/voice-sdk');

      if (deviceRef.current) {
        deviceRef.current.destroy();
      }

      const device = new TwilioDevice(data.token, {
        logLevel: 1,
        codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
      });

      device.on('registered', () => {
        setDeviceReady(true);
        setError(null);
      });

      device.on('error', (err: { message: string }) => {
        setError(err.message);
        setCallState('error');
      });

      device.on('tokenWillExpire', async () => {
        try {
          const { data: refresh } = await api.get<DialerTokenResponse>('/api/dialer/token');
          device.updateToken(refresh.token);
        } catch {
          setError('Failed to refresh token');
        }
      });

      await device.register();
      deviceRef.current = device;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initialize dialer');
    }
  }, []);

  const makeCall = useCallback(async (toPhone: string, params: Record<string, string> = {}) => {
    const device = deviceRef.current;
    if (!device) {
      setError('Device not initialized');
      return;
    }

    cleanup();
    setCallState('connecting');

    try {
      const call = await device.connect({
        params: { To: toPhone, ...params },
      });

      callRef.current = call;

      call.on('accept', () => {
        setCallState('connected');
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      });

      call.on('ringing', () => {
        setCallState('ringing');
      });

      call.on('disconnect', () => {
        setCallState('ended');
        cleanup();
      });

      call.on('cancel', () => {
        setCallState('idle');
        cleanup();
      });

      call.on('error', (err: { message: string }) => {
        setError(err.message);
        setCallState('error');
        cleanup();
      });

      setActiveCallSid(call.parameters?.CallSid ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Call failed');
      setCallState('error');
    }
  }, [cleanup]);

  const hangup = useCallback(() => {
    const call = callRef.current as { disconnect?: () => void } | null;
    call?.disconnect?.();
    setCallState('ended');
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const call = callRef.current as { isMuted?: () => boolean; mute?: (m: boolean) => void } | null;
    if (call?.isMuted && call?.mute) {
      const newMuted = !call.isMuted();
      call.mute(newMuted);
      setIsMuted(newMuted);
    }
  }, []);

  const resetCall = useCallback(() => {
    setCallState('idle');
    setError(null);
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    deviceReady,
    callState,
    callDuration,
    isMuted,
    error,
    activeCallSid,
    initDevice,
    makeCall,
    hangup,
    toggleMute,
    resetCall,
  };
}
