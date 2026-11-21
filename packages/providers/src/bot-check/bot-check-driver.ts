export type BotCheckDriver = {
  // Not null when the check is rendered in the browser; the page needs it to show the widget.
  siteKey: string | null;
  verify(token: string, ip: string): Promise<boolean>;
};
