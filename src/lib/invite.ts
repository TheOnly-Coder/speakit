export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  // Use crypto when available (server), fallback to Math.random
  const rand = () => {
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return arr[0] / 4294967296;
    }
    return Math.random();
  };
  for (let i = 0; i < 8; i++) code += chars[Math.floor(rand() * chars.length)];
  return code;
}
