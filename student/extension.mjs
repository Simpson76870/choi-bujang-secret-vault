// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '로그인 사용자·기기·세션');

      const addText = (parent, tag, value) => {
        const node = document.createElement(tag);
        node.textContent = String(value ?? '');
        parent.appendChild(node);
        return node;
      };
      const modeText = (mode) => ({
        demo: '예제 자료',
        disconnected: '연결 없음',
        unknown: '확인 불가'
      })[mode] ?? '';
      const deviceText = (status) => ({
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가'
      })[status] ?? '확인 불가';
      const sessionText = (status) => ({
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가'
      })[status] ?? '확인 불가';
      const field = (parent, name, value) => {
        addText(parent, 'p', name + ': ' + String(value ?? '확인 불가'));
      };
      const section = (title, result, show) => {
        const node = document.createElement('section');
        addText(node, 'h3', title);
        const mode = modeText(result?.mode);
        if (mode) addText(node, 'p', mode);
        if (result?.status === 'loading') {
          addText(node, 'p', '불러오는 중');
        } else if (result?.status === 'error') {
          addText(node, 'p', '연결 실패: ' + String(result?.error?.message ?? '확인 불가'));
        } else if (result?.status === 'ok') {
          show(node, result.data);
        } else {
          addText(node, 'p', '확인 불가');
        }
        root.appendChild(node);
      };

      section('내 계정 및 현재 기기·세션', me, (node, data) => {
        addText(node, 'h4', '로그인 사용자');
        field(node, '이름', data?.user?.label);
        field(node, '사용자 ID', data?.user?.id);
        addText(node, 'h4', '현재 기기');
        field(node, '기기 이름', data?.device?.label);
        field(node, '기기 ID', data?.device?.id);
        field(node, '기기 보안 상태', deviceText(data?.device?.status));
        addText(node, 'h4', '현재 세션');
        field(node, '세션 ID', data?.session?.id);
        field(node, '세션 상태', sessionText(data?.session?.status));
      });
      section('등록된 기기', devices, (node, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          addText(node, 'p', '표시할 기기 없음');
          return;
        }
        const list = document.createElement('ul');
        for (const item of data) {
          const li = document.createElement('li');
          field(li, '기기 이름', item?.label);
          field(li, '기기 ID', item?.id);
          field(li, '기기 보안 상태', deviceText(item?.status));
          list.appendChild(li);
        }
        node.appendChild(list);
      });
      section('로그인 세션', sessions, (node, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          addText(node, 'p', '표시할 세션 없음');
          return;
        }
        const list = document.createElement('ul');
        for (const item of data) {
          const li = document.createElement('li');
          field(li, '세션 ID', item?.id);
          field(li, '세션 상태', sessionText(item?.status));
          list.appendChild(li);
        }
        node.appendChild(list);
      });
      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '업무 앱 접근 요청 결과');

      const addText = (tag, value) => {
        const node = document.createElement(tag);
        node.textContent = String(value ?? '');
        root.appendChild(node);
      };

      addText('h3', '업무 앱 접근 요청 결과');
      const modeLabel = {
        demo: '예제 자료',
        disconnected: '연결 없음',
        unknown: '확인 불가'
      }[mode];
      if (modeLabel) addText('p', '연결 상태: ' + modeLabel);

      if (status === 'idle') {
        addText('p', '업무 앱을 선택한 뒤 접근을 요청하세요.');
      } else if (status === 'loading') {
        addText('p', '접근 판정 확인 중');
      } else if (status === 'error') {
        addText('p', '요청 실패: ' + String(error?.message ?? '오류 내용을 확인할 수 없습니다.'));
        addText('p', '접근 거부 판정이 아니라 요청 처리 실패입니다.');
      } else if (status === 'ok') {
        const selectedAppId = data?.appId ?? appId;
        addText('p', '업무 앱 ID: ' + String(selectedAppId ?? '확인 불가'));

        const labels = {
          allow: '접근 허용',
          deny: '접근 거부',
          challenge: '추가 확인 필요',
          unknown: '확인 불가'
        };
        const rawDecision = data?.decision;
        const known = typeof rawDecision === 'string' &&
          Object.prototype.hasOwnProperty.call(labels, rawDecision);
        const decision = known ? rawDecision : 'unknown';
        addText('p', '접근 판정: ' + labels[decision] + '(' + decision + ')');
        if (decision === 'challenge') {
          addText('p', '추가 인증 또는 확인이 필요합니다. 이 화면은 확인 절차를 대신 수행하지 않습니다.');
        } else if (decision === 'allow') {
          addText('p', '정책상 접근 허용 판정이며, 실제 앱 접속 성공을 보장하지 않습니다.');
        } else if (decision === 'unknown') {
          addText('p', '접근 허용 여부를 확인할 수 없습니다.');
        }
        addText('p', '판정 이유: ' + String(data?.reason ?? '확인 불가'));
        addText('p', '판정 시각: ' + String(data?.checkedAt ?? '확인 불가'));
      } else {
        addText('p', '접근 요청 상태 확인 불가');
      }

      return root;
    },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
