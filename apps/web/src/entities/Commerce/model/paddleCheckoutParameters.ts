export type PaddleCheckoutParameters = {
  transactionId: string;
  successUrl: string;
  failHref: string;
};

export function parsePaddleCheckoutParameters(
  search: string,
  currentOrigin: string,
): PaddleCheckoutParameters | null {
  const params = new URLSearchParams(search);
  const transactionId = params.get('_ptxn');
  const successValue = params.get('successUrl');
  const failValue = params.get('failUrl');
  if (!transactionId?.trim() || !successValue?.trim() || !failValue?.trim()) return null;

  try {
    const successUrl = new URL(successValue, currentOrigin);
    const failUrl = new URL(failValue, currentOrigin);
    if (successUrl.origin !== currentOrigin || failUrl.origin !== currentOrigin) return null;
    if (successUrl.username || successUrl.password || failUrl.username || failUrl.password) return null;
    return {
      transactionId,
      successUrl: successUrl.href,
      failHref: `${failUrl.pathname}${failUrl.search}${failUrl.hash}`,
    };
  } catch {
    return null;
  }
}
