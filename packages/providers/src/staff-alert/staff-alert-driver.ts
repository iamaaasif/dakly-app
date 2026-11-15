export type StaffAlertMessage = { id: string; text: string };
export type StaffAlertCredentials = { token: string; channel: string };
export type StaffAlertDriver = {
  send(message: StaffAlertMessage, credentials: StaffAlertCredentials): Promise<void>;
};
