export function notifySessionChange() {
  const channel = new BroadcastChannel('dakly-session');
  // Receivers close content while checking the new cookie against the API.
  channel.postMessage('changed');
  channel.close();
}
