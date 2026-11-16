// src/lib/privacy.ts —— 隐私脱敏：手机号 / 证件号 / 卡号 / 邮箱（供各接口在发送第三方前统一调用）
export function redactPii(text: string): string {
  return text
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号已脱敏]")
    .replace(/\b\d{17}[\dXx]\b/g, "[证件号已脱敏]")
    .replace(/\b\d{16,19}\b/g, "[卡号已脱敏]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[邮箱已脱敏]");
}
