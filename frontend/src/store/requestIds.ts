let namespacesRequestId = 0;
let podsRequestId = 0;
let contextsRequestId = 0;

export function nextContextsRequestId(): number {
  contextsRequestId += 1;
  return contextsRequestId;
}

export function invalidateContextsRequests(): void {
  contextsRequestId += 1;
}

export function isCurrentContextsRequest(requestId: number): boolean {
  return requestId === contextsRequestId;
}

export function nextNamespacesRequestId(): number {
  namespacesRequestId += 1;
  return namespacesRequestId;
}

export function invalidateNamespacesRequests(): void {
  namespacesRequestId += 1;
}

export function isCurrentNamespacesRequest(requestId: number): boolean {
  return requestId === namespacesRequestId;
}

export function nextPodsRequestId(): number {
  podsRequestId += 1;
  return podsRequestId;
}

export function invalidatePodsRequests(): void {
  podsRequestId += 1;
}

export function isCurrentPodsRequest(requestId: number): boolean {
  return requestId === podsRequestId;
}