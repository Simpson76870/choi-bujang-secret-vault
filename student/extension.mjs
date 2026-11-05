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
    renderEvents({ status, mode, data, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '내 접속 기록 및 XDR 경보');

      const add = (parent, tag, text) => {
        const element = document.createElement(tag);
        element.textContent = String(text ?? '');
        parent.appendChild(element);
        return element;
      };
      const labels = {
        access: { allowed: '허용', denied: '거부', unknown: '확인 불가' },
        session: { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' },
        device: { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' }
      };
      const stateLabel = (type, value) => {
        const raw = value == null || value === '' ? 'unknown' : String(value);
        const meaning = Object.prototype.hasOwnProperty.call(labels[type], raw)
          ? labels[type][raw] : '확인 불가';
        return meaning + '(' + raw + ')';
      };
      const kindLabel = value => value === 'access' ? '접속(access)'
        : value === 'xdr' ? 'XDR 경보(xdr)' : '확인 불가(' + String(value ?? 'unknown') + ')';
      const appLabel = value => value == null || value === '' ? '앱을 확인할 수 없음' : String(value);
      const modeLabel = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' }[mode];
      add(root, 'h3', '내 접속 기록 및 XDR 경보');
      if (modeLabel) add(root, 'p', '연결 상태: ' + modeLabel);

      if (status === 'loading') {
        add(root, 'p', '기록을 불러오는 중');
        return root;
      }
      if (status === 'error') {
        const code = error?.code;
        if (code === 'CONTRACT_MISMATCH') {
          add(root, 'p', '기록 확인 불가: 데이터 계약 불일치(CONTRACT_MISMATCH)');
        } else {
          add(root, 'p', '기록을 불러오지 못했습니다: ' + String(error?.message ?? '오류 내용을 확인할 수 없습니다.'));
        }
        return root;
      }
      if (status !== 'ok') {
        add(root, 'p', '기록 조회 전 또는 상태 확인 불가');
        return root;
      }
      if (!Array.isArray(data)) {
        add(root, 'p', '기록 확인 불가: 데이터 형식이 올바르지 않습니다.');
        return root;
      }
      const records = [...data].sort((a, b) => {
        const left = Date.parse(a?.at ?? '') || 0;
        const right = Date.parse(b?.at ?? '') || 0;
        return right - left;
      });
      if (records.length === 0) {
        add(root, 'p', '표시할 기록이 없습니다');
        return root;
      }

      const filters = document.createElement('div');
      const listArea = document.createElement('div');
      const detailArea = document.createElement('div');
      const controls = {};
      const makeFilter = (title, key, values, getValue) => {
        const label = add(filters, 'label', title);
        const select = document.createElement('select');
        select.setAttribute('aria-label', title);
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = '전체';
        select.appendChild(allOption);
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = key === 'kind' ? kindLabel(value)
            : key === 'appId' ? appLabel(value) : stateLabel('access', value);
          select.appendChild(option);
        }
        label.appendChild(select);
        controls[key] = select;
        select.addEventListener('change', renderList);
      };
      const distinct = (getValue) => [...new Set(records.map(getValue))];
      makeFilter('기록 종류', 'kind', distinct(event => String(event?.kind ?? '')), event => event?.kind);
      makeFilter('업무 앱', 'appId', distinct(event => String(event?.appId ?? '')), event => event?.appId);
      makeFilter('접속 상태', 'access', distinct(event => String(event?.state?.access ?? 'unknown')), event => event?.state?.access);
      root.appendChild(filters);
      root.appendChild(listArea);
      root.appendChild(detailArea);

      const showDetail = event => {
        detailArea.replaceChildren();
        const detail = document.createElement('section');
        detail.setAttribute('data-student-event-detail', String(event?.id ?? ''));
        add(detail, 'h4', '기록 상세');
        add(detail, 'p', '사건 ID: ' + String(event?.id ?? '확인 불가'));
        add(detail, 'p', '업무 앱: ' + appLabel(event?.appId));
        const items = (title, values) => {
          add(detail, 'h5', title);
          if (!Array.isArray(values) || values.length === 0) {
            add(detail, 'p', '표시할 항목이 없습니다');
            return;
          }
          const list = document.createElement('ul');
          for (const item of values) {
            add(list, 'li', 'ID: ' + String(item?.id ?? '확인 불가') +
              ' / 내용: ' + String(item?.text ?? '확인 불가'));
          }
          detail.appendChild(list);
        };
        items('근거(evidence)', event?.evidence);
        items('규칙(rules)', event?.rules);
        add(detail, 'h5', '접속·세션·기기 상태');
        add(detail, 'p', '접속 상태(access): ' + stateLabel('access', event?.state?.access));
        add(detail, 'p', '세션 상태(session): ' + stateLabel('session', event?.state?.session));
        add(detail, 'p', '기기 상태(device): ' + stateLabel('device', event?.state?.device));
        const actions = Array.isArray(event?.supportedActions) ? event.supportedActions : [];
        if (actions.length > 0) {
          add(detail, 'p', '조치 실행 연결은 준비 중입니다. 아래 조치는 아직 지원하지 않습니다.');
          for (const action of actions) {
            const name = typeof action === 'string' ? action : action?.action;
            if (name == null || name === '') continue;
            const button = add(detail, 'button', String(name) + ' 미지원');
            button.type = 'button';
            button.disabled = true;
          }
        }
        detailArea.appendChild(detail);
      };

      function renderList() {
        listArea.replaceChildren();
        detailArea.replaceChildren();
        const selected = records.filter(event =>
          (controls.kind.value === 'all' || String(event?.kind ?? '') === controls.kind.value) &&
          (controls.appId.value === 'all' || String(event?.appId ?? '') === controls.appId.value) &&
          (controls.access.value === 'all' || String(event?.state?.access ?? 'unknown') === controls.access.value)
        );
        add(listArea, 'p', '표시된 기록: ' + selected.length + '건');
        if (selected.length === 0) {
          add(listArea, 'p', '필터 조건에 해당하는 기록이 없습니다');
          return;
        }
        const list = document.createElement('ul');
        for (const event of selected) {
          const row = document.createElement('li');
          row.setAttribute('data-student-event-id', String(event?.id ?? ''));
          add(row, 'p', '사건 ID: ' + String(event?.id ?? '확인 불가'));
          add(row, 'p', '시각: ' + String(event?.at ?? '확인 불가'));
          add(row, 'p', '종류: ' + kindLabel(event?.kind));
          add(row, 'p', '업무 앱: ' + appLabel(event?.appId));
          add(row, 'p', '요약: ' + String(event?.summary ?? '확인 불가'));
          const button = add(row, 'button', String(event?.id ?? '') + ' 상세');
          button.type = 'button';
          button.addEventListener('click', () => showDetail(event));
          list.appendChild(row);
        }
        listArea.appendChild(list);
      }
      renderList();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '기기·세션·알림 및 진단 상태');
      const add = (parent, tag, value) => {
        const node = document.createElement(tag);
        node.textContent = String(value ?? '');
        parent.appendChild(node);
        return node;
      };
      const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      const deviceStates = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가'
      };
      const sessionStates = {
        active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가'
      };
      const stateText = (value, states) => {
        const raw = value == null ? 'unknown' : String(value);
        const label = Object.prototype.hasOwnProperty.call(states, raw) ? states[raw] : '확인 불가';
        return label + '(' + raw + ')';
      };
      const safeText = value => value == null || value === '' ? '확인 불가' : String(value);
      const errorText = result => {
        const message = safeText(result?.error?.message);
        const code = String(result?.error?.code ?? '');
        const timedOut = /timeout|timed.out|시간.초과/i.test(code + ' ' + message);
        return (timedOut ? '시간 초과: ' : '') + message;
      };
      const retryNotice = node => {
        add(node, 'p', '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요.');
      };
      add(root, 'h3', '기기·세션·알림 및 진단 상태');
      if (Object.prototype.hasOwnProperty.call(modes, mode)) {
        add(root, 'p', '연결 상태: ' + modes[mode]);
      }
      const showCollection = (title, result, emptyMessage, renderItem) => {
        const section = add(root, 'section', '');
        add(section, 'h4', title);
        if (Object.prototype.hasOwnProperty.call(modes, result?.mode)) {
          add(section, 'p', '자료 모드: ' + modes[result.mode]);
        }
        if (result?.status === 'loading') {
          add(section, 'p', title + ' 불러오는 중');
        } else if (result?.status === 'error') {
          add(section, 'p', title + ' 정보를 불러오지 못했습니다: ' + errorText(result));
          retryNotice(section);
        } else if (result?.status === 'ok') {
          if (!Array.isArray(result.data)) {
            add(section, 'p', title + ' 확인 불가: 데이터 형식 오류');
          } else if (result.data.length === 0) {
            add(section, 'p', emptyMessage);
          } else {
            const list = document.createElement('ul');
            for (const item of result.data) {
              const li = document.createElement('li');
              renderItem(li, item);
              list.appendChild(li);
            }
            section.appendChild(list);
          }
        } else {
          add(section, 'p', title + ' 확인 불가');
        }
      };
      showCollection('등록 기기', devices, '등록된 기기가 없음', (li, item) => {
        add(li, 'p', '기기 이름: ' + safeText(item?.label));
        add(li, 'p', '기기 상태: ' + stateText(item?.status, deviceStates));
      });
      add(root, 'p', '세션 조회 범위: 지금 검증된 연결 한 개입니다. 과거 세션 전체 목록이 아닙니다.');
      showCollection('현재 세션', sessions, '현재 연결 없음', (li, item) => {
        add(li, 'p', '세션 ID: ' + safeText(item?.id));
        add(li, 'p', '세션 상태: ' + stateText(item?.status, sessionStates));
      });

      const alertSection = document.createElement('section');
      add(alertSection, 'h4', '알림');
      if (!Array.isArray(notifications) || notifications.length === 0) {
        add(alertSection, 'p', '주의할 알림이 없습니다');
      } else {
        const list = document.createElement('ul');
        for (const notice of notifications) {
          const li = document.createElement('li');
          add(li, 'p', '자료(resource): ' + safeText(notice?.resource));
          add(li, 'p', '코드(code): ' + safeText(notice?.code));
          add(li, 'p', '내용(message): ' + safeText(notice?.message));
          list.appendChild(li);
        }
        alertSection.appendChild(list);
      }
      root.appendChild(alertSection);

      const section = document.createElement('section');
      add(section, 'h4', '진단 정보');
      if (Object.prototype.hasOwnProperty.call(modes, diagnostics?.mode)) {
        add(section, 'p', '자료 모드: ' + modes[diagnostics.mode]);
      }
      const fields = [
        ['requestId', diagnostics?.data?.requestId],
        ['component', diagnostics?.data?.component],
        ['version', diagnostics?.data?.version],
        ['checkedAt', diagnostics?.data?.checkedAt],
        ['engine.mode', diagnostics?.data?.engine?.mode],
        ['engine.code', diagnostics?.data?.engine?.code]
      ];
      const safeFields = fields.map(([key, value]) => [key, safeText(value)]);
      if (diagnostics?.status === 'loading') {
        add(section, 'p', '진단 정보 불러오는 중');
      } else if (diagnostics?.status === 'error') {
        add(section, 'p', '진단 정보를 불러오지 못했습니다: ' + errorText(diagnostics));
        retryNotice(section);
      } else if (diagnostics?.status === 'ok') {
        if (diagnostics.data == null || typeof diagnostics.data !== 'object' ||
            Object.keys(diagnostics.data).length === 0) {
          add(section, 'p', '진단 정보가 없습니다');
        } else {
          for (const [key, value] of safeFields) {
            add(section, 'p', key + ': ' + value);
          }
        }
      } else {
        add(section, 'p', '진단 정보 확인 불가');
      }
      add(section, 'p', '도움정보 복사는 지원 요청에 필요한 비밀 없는 진단 항목만 복사합니다.');
      const button = add(section, 'button', '도움정보 복사');
      button.type = 'button';
      button.addEventListener('click', () => {
        const lines = diagnostics?.status === 'ok'
          ? safeFields.map(([key, value]) => key + ': ' + value)
          : ['진단 상태: ' + safeText(diagnostics?.status)];
        const copyText = lines.join('\n');
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(copyText).then(
            () => { feedback.textContent = '도움정보를 복사했습니다.'; },
            () => { feedback.textContent = '복사하지 못했습니다. 브라우저 권한을 확인하세요.'; }
          );
        } else {
          feedback.textContent = '복사 기능을 사용할 수 없습니다.';
        }
      });
      const feedback = add(section, 'p', '');
      feedback.setAttribute('role', 'status');
      root.appendChild(section);
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
