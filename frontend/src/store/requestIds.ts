let namespacesRequestId = 0;
let podsRequestId = 0;

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