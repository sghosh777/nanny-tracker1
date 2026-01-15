
export interface TimeSession {
  id: string;
  startTime: string;
  endTime?: string;
  durationInMinutes?: number;
  note?: string;
  isOutOfBounds?: boolean;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface HomeConfig {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export enum ClockStatus {
  CLOCKED_OUT = 'CLOCKED_OUT',
  CLOCKED_IN = 'CLOCKED_IN',
  IDLE = 'IDLE'
}
