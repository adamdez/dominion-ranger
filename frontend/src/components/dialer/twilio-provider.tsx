'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useTwilioDevice, type CallState } from '@/hooks/use-twilio-device';
import { SoftphoneWidget } from './softphone-widget';
import { useLogDisposition } from '@/hooks/use-dial-queue';
import { useTransitionLead } from '@/hooks/use-leads';
import { DISPOSITION_TYPES } from '@/lib/constants';

interface ActiveCallInfo {
  dominionLeadId: string;
  leadInstanceId: string;
  leadName: string;
  phone: string;
  version: number;
}

interface TwilioContextValue {
  deviceReady: boolean;
  callState: CallState;
  callDuration: number;
  isMuted: boolean;
  error: string | null;
  initDevice: () => Promise<void>;
  startCall: (info: ActiveCallInfo) => void;
  hangup: () => void;
  toggleMute: () => void;
}

const TwilioContext = createContext<TwilioContextValue | null>(null);

export function useTwilioContext() {
  const ctx = useContext(TwilioContext);
  if (!ctx) throw new Error('useTwilioContext must be used within TwilioProvider');
  return ctx;
}

export function TwilioProvider({ children }: { children: ReactNode }) {
  const device = useTwilioDevice();
  const logDisposition = useLogDisposition();
  const transitionLead = useTransitionLead();
  const [callInfo, setCallInfo] = useState<ActiveCallInfo | null>(null);

  const startCall = useCallback(
    (info: ActiveCallInfo) => {
      setCallInfo(info);
      device.makeCall(info.phone, {
        dominionLeadId: info.dominionLeadId,
        leadInstanceId: info.leadInstanceId,
      });
    },
    [device],
  );

  const handleDisposition = useCallback(
    (disposition: string, notes: string) => {
      if (!callInfo) return;

      logDisposition.mutate({
        leadInstanceId: callInfo.leadInstanceId,
        disposition,
        notes: notes || undefined,
      });

      const dispConfig = DISPOSITION_TYPES[disposition as keyof typeof DISPOSITION_TYPES];
      if (dispConfig?.action === 'dead' || dispConfig?.action === 'dnc') {
        transitionLead.mutate({
          leadInstanceId: callInfo.leadInstanceId,
          toStatus: 'DEAD',
          expectedVersion: callInfo.version + 1,
        });
      } else if (dispConfig?.action === 'contacted') {
        transitionLead.mutate({
          leadInstanceId: callInfo.leadInstanceId,
          toStatus: 'CONTACTED',
          expectedVersion: callInfo.version + 1,
        });
      }
    },
    [callInfo, logDisposition, transitionLead],
  );

  const handleDismiss = useCallback(() => {
    device.resetCall();
    setCallInfo(null);
  }, [device]);

  return (
    <TwilioContext.Provider
      value={{
        deviceReady: device.deviceReady,
        callState: device.callState,
        callDuration: device.callDuration,
        isMuted: device.isMuted,
        error: device.error,
        initDevice: device.initDevice,
        startCall,
        hangup: device.hangup,
        toggleMute: device.toggleMute,
      }}
    >
      {children}

      {callInfo && device.callState !== 'idle' && (
        <SoftphoneWidget
          leadName={callInfo.leadName}
          phone={callInfo.phone}
          callState={device.callState}
          callDuration={device.callDuration}
          isMuted={device.isMuted}
          onHangup={device.hangup}
          onToggleMute={device.toggleMute}
          onDisposition={handleDisposition}
          onDismiss={handleDismiss}
        />
      )}
    </TwilioContext.Provider>
  );
}
