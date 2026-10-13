// ALEPH SDP 엔진이 확인한 요청만 받습니다.
// 등록 여부는 엔진이 계약에 따라 검증해 전달한 deviceRegistered 필드만 사용합니다.
// 기기 키·토큰·별도 신원 필드를 만들거나 저장하지 않습니다.
export const RULE_IDS = Object.freeze(['device_registered']);

export async function decide(request) {
  const deviceRegistered = request?.deviceRegistered === true;
  return {
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision: deviceRegistered ? 'allow' : 'deny',
    reasonCode: deviceRegistered ? 'approved' : 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
