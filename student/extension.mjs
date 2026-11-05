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
    renderAiConnection(input = {}) {
      const { status, mode, data, error, checkedAt, explanationAccepted = false } = input;
      const root = document.createElement('section');
      root.setAttribute('aria-label', '앱 내부 AI 연결 상태');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        root.appendChild(node);
        return node;
      };
      const safe = value => {
        if (value === null || value === undefined || value === '') return '확인 불가';
        return String(value)
          .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[민감정보 생략]')
          .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+\b/gi, 'Bearer [민감정보 생략]')
          .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]\s*)\S+/gi, '$1[민감정보 생략]');
      };
      add('h3', 'AI 연결 점검');

      const modes = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
      if (Object.prototype.hasOwnProperty.call(modes, mode)) {
        add('p', '연결 모드: ' + modes[mode]);
      }

      if (status === 'idle') {
        add('p', 'AI 연결 점검 전');
        add('p', '계정 연결과 앱 권한을 확인한 뒤 현재 API 연결 점검 버튼을 직접 누르세요.');
      } else if (status === 'loading') {
        add('p', 'AI 연결 점검 중');
        add('p', '사건 설명은 아직 실행하지 않았습니다.');
      } else if (status === 'ok') {
        // 공식 화면은 data.modelCount, 통과 해설은 최상위 modelCount를 사용한다.
        // 어느 쪽이 와도 받은 값만 표시하고, 연결 여부를 추측하지 않는다.
        const modelCount = data?.modelCount ?? input.modelCount;
        add('p', '사용 가능 모델 수: ' + safe(modelCount));
        const transportChecked = data?.transportChecked;
        if (transportChecked === true) {
          add('p', 'AI 전송 점검 확인(transportChecked: true)');
        } else if (transportChecked === false) {
          add('p', 'AI 전송 점검 미확인(transportChecked: false)');
        } else {
          add('p', 'AI 전송 점검 확인 불가');
        }

        const authorization = data?.audienceAuthorization;
        if (authorization === 'test') {
          add('p', '시험 연결 점검(test)');
        } else if (authorization === 'verified') {
          add('p', '앱 권한 확인 후 점검(verified)');
        } else {
          add('p', '앱 권한 상태 확인 불가(unknown)');
        }

        add('p', '점검 시각: ' + safe(checkedAt));
        add('p', '연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다.');
        if (transportChecked === false) {
          add('p', 'AI 전송이 확인되지 않았으므로 연결 성공으로 판단하지 마세요.');
        }
        if (modelCount === 0 || modelCount === '0') {
          add('p', '사용 가능한 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.');
        }
        if (explanationAccepted === true) {
          add('p', '사건 설명 요청 수락 정보가 전달됐지만 실제 설명 결과는 보안 기록에서 별도로 확인해야 합니다.');
        }
      } else if (status === 'error') {
        const code = safe(error?.code);
        const message = safe(error?.message);
        const category = code.toUpperCase();
        const AI_GUIDE = [
          [/CANCEL|ABORT|ABORTED|CANCELED|CANCELLED/, '점검이 취소되었습니다. 이전 점검 결과는 현재 결과가 아닙니다.'],
          [/TIMEOUT|TIMED_OUT|DEADLINE|ETIMEDOUT|REQUEST_EXPIRED/, '시간 초과로 AI 연결 점검을 마치지 못했습니다. 잠시 뒤 직접 다시 점검하세요.'],
          [/RATE|THROTTLE|TOO_MANY|429/, '요청 제한 상태입니다. 잠시 뒤 직접 다시 점검하세요.'],
          [/NETWORK|FETCH|ECONN|ENOTFOUND|DNS|UNREACHABLE|GATEWAY_ERROR/, '네트워크 또는 전송 오류입니다. 잠시 뒤 직접 다시 점검하세요.'],
          [/NO_MODEL|MODEL_UNAVAILABLE|MODEL_NOT_FOUND|MODEL_NOT_ALLOWED|MODELS_EMPTY|NO_AVAILABLE_MODEL/, '사용 가능한 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.'],
          [/OUTSIDE_HOURS|TIME_WINDOW|OPERATING_HOURS|TIME_RESTRICTED|SCHEDULE|CLASS_HOURS/, '현재 이용 가능한 시간이 아닙니다. 이용 시간을 확인하세요.'],
          [/QUOTA|BUDGET|USAGE|CREDIT|LIMIT_EXCEEDED|CLASS_LIMIT|ALLOWANCE/, '반 사용량 또는 이용 한도에 도달했습니다. 담당자에게 확인하세요.'],
          [/PROVISION|PENDING|NOT_READY|NOT_CONFIGURED/, '계정 또는 앱 권한 준비 중입니다. 담당자에게 연결 상태를 확인하세요.'],
          [/AUTHENTICATION|UNAUTHORIZED|AUTH_FAILED|INVALID_TOKEN|TOKEN_EXPIRED|LOGIN|401/, '인증 실패입니다. 계정 연결을 다시 확인하고 담당자에게 문의하세요.'],
          [/FORBIDDEN|DENIED|ACCESS|PERMISSION|AUTHORIZATION|403/, '앱 접근 권한이 제한되었습니다. 담당자에게 앱 권한을 확인하세요.']
        ];
        const match = AI_GUIDE.find(([pattern]) => pattern.test(category));
        add('p', 'AI 연결 점검 실패');
        add('p', '오류 코드: ' + code);
        add('p', '오류 메시지: ' + message);
        add('p', match ? match[1] : '연결 상태를 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한을 확인하세요.');
        add('p', '다시 점검하려면 현재 API 연결 점검 버튼을 직접 누르세요.');
      } else {
        add('p', 'AI 연결 점검 상태 확인 불가');
      }
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '보안 사건 AI 설명');

      const add = (parent, tag, value) => {
        const node = document.createElement(tag);
        node.textContent = String(value ?? '');
        parent.appendChild(node);
        return node;
      };
      const safeError = value => {
        if (value == null || value === '') return '확인 불가';
        return String(value)
          .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[민감정보 생략]')
          .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [민감정보 생략]')
          .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]\s*)\S+/gi, '$1[민감정보 생략]');
      };
      const failure = (message, unusable = false) => {
        root.setAttribute('data-student-explanation-error', 'true');
        if (unusable) {
          root.setAttribute('data-student-unusable-explanation', 'true');
          add(root, 'p', '쓸 수 없는 설명(unusable): ' + message);
        } else {
          add(root, 'p', 'AI 설명 실패: ' + message);
        }
        if (explanation?.error?.code != null) {
          add(root, 'p', '오류 코드: ' + safeError(explanation.error.code));
        }
        if (explanation?.error?.message != null) {
          add(root, 'p', '오류 메시지: ' + safeError(explanation.error.message));
        }
        add(root, 'p', '원본 기록은 그대로 유지됩니다.');
        return root;
      };

      add(root, 'h3', 'AI 설명(참고용)');

      // 오류를 먼저 처리해야 event가 null이어도 실패 원인이 사라지지 않는다.
      if (explanation?.status === 'error') {
        return failure('요청에 실패했습니다.');
      }
      if (!event || event.id == null) {
        add(root, 'p', '보안 기록에서 기록을 먼저 고르세요.');
        return root;
      }
      if (explanation?.status === 'loading') {
        add(root, 'p', 'AI 설명 요청 중');
        return root;
      }
      if (explanation?.status !== 'ok') {
        add(root, 'p', 'AI 설명 요청 전 또는 상태 확인 불가');
        return root;
      }

      const data = explanation.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return failure('AI 설명 데이터 형식이 올바르지 않습니다.', true);
      }
      if (typeof data.summary !== 'string' || !data.summary.trim()) {
        return failure('AI 설명 요약이 없습니다.', true);
      }
      if (!Array.isArray(data.evidenceIds) || data.evidenceIds.length === 0) {
        return failure('인용된 근거 ID가 없어 설명을 확인할 수 없습니다.', true);
      }
      if (!Array.isArray(event.evidence) || event.evidence.length === 0) {
        return failure('선택한 기록에 대조할 근거가 없습니다.', true);
      }
      if (!Array.isArray(data.proposals)) {
        return failure('제안 자료의 형식을 확인할 수 없습니다.', true);
      }
      if (data.executed !== false) {
        return failure('실행되지 않았다는 조건을 확인할 수 없습니다. 실행된 설명은 사용할 수 없습니다.', true);
      }
      if (data.requiresHumanConfirmation !== true) {
        return failure('사람 확인이 필요하다는 조건을 확인할 수 없습니다.', true);
      }

      const evidenceById = new Map();
      for (const evidence of event.evidence) {
        if (!evidence || evidence.id == null || evidenceById.has(String(evidence.id))) {
          return failure('선택한 기록의 근거 ID가 누락되었거나 중복되었습니다.', true);
        }
        evidenceById.set(String(evidence.id), evidence);
      }
      const cited = new Set();
      for (const id of data.evidenceIds) {
        const key = String(id);
        if (cited.has(key)) {
          return failure('중복 인용된 근거 ID가 있어 설명을 사용할 수 없습니다: ' + key, true);
        }
        if (!evidenceById.has(key)) {
          return failure('선택한 기록에 없는 근거 ID를 인용했습니다: ' + key, true);
        }
        cited.add(key);
      }
      if (cited.size !== evidenceById.size) {
        return failure('선택한 기록의 근거 ID 일부가 인용되지 않았습니다.', true);
      }

      const supportedActions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
      const supportedNames = new Set(supportedActions.map(item =>
        String(typeof item === 'string' ? item : item?.action ?? item?.id ?? '')
      ));
      for (const proposal of data.proposals) {
        if (!proposal || typeof proposal.action !== 'string' ||
            !supportedNames.has(proposal.action)) {
          return failure('선택한 기록에서 지원하지 않는 조치가 제안되었습니다.', true);
        }
        if (typeof proposal.reason !== 'string' || !proposal.reason.trim()) {
          return failure('제안 이유를 확인할 수 없습니다.', true);
        }
        if (!Array.isArray(proposal.evidenceIds) ||
            proposal.evidenceIds.some(id => !cited.has(String(id)))) {
          return failure('제안의 근거 ID가 선택한 기록과 맞지 않습니다.', true);
        }
      }

      // 모든 조건을 확인한 뒤에만 성공한 설명의 표식을 붙인다.
      root.setAttribute('data-student-explanation-event', String(event.id));
      add(root, 'p', '사건 ID: ' + String(event.id));
      add(root, 'p', 'AI 요약(참고용): ' + data.summary);
      if (checkedAt != null) add(root, 'p', '설명 확인 시각: ' + String(checkedAt));

      add(root, 'h4', '인용 근거');
      const evidenceList = document.createElement('ul');
      for (const id of data.evidenceIds) {
        const evidence = evidenceById.get(String(id));
        add(evidenceList, 'li', String(id) + ' — ' + String(evidence.text ?? '확인 불가'));
      }
      root.appendChild(evidenceList);

      add(root, 'h4', '적용 규칙');
      if (Array.isArray(event.rules) && event.rules.length > 0) {
        const ruleList = document.createElement('ul');
        for (const rule of event.rules) {
          add(ruleList, 'li', String(rule?.id ?? '확인 불가') +
            ' — ' + String(rule?.text ?? '확인 불가'));
        }
        root.appendChild(ruleList);
      } else {
        add(root, 'p', '표시할 규칙이 없습니다.');
      }

      add(root, 'h4', '확인 불가 상태');
      const unknownStates = [
        ['접속', event.state?.access],
        ['세션', event.state?.session],
        ['기기', event.state?.device]
      ].filter(([, value]) => value == null || value === 'unknown');
      if (unknownStates.length === 0) {
        add(root, 'p', '없음');
      } else {
        for (const [name] of unknownStates) {
          add(root, 'p', name + ': 확인 불가(unknown)');
        }
      }

      add(root, 'h4', 'AI 조치 제안');
      if (data.proposals.length === 0) {
        add(root, 'p', supportedActions.length === 0
          ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
          : 'AI가 제안한 조치가 없습니다.');
      } else {
        const proposalsList = document.createElement('ul');
        for (const proposal of data.proposals) {
          add(proposalsList, 'li', '조치: ' + proposal.action +
            ' / 이유: ' + proposal.reason +
            ' / 근거 ID: ' + proposal.evidenceIds.map(String).join(', ') +
            ' / 사람 확인이 필요하며 실행되지 않았습니다.');
        }
        root.appendChild(proposalsList);
      }
      add(root, 'p', 'AI 설명과 제안은 참고용이며, 어떤 보안 조치도 실행되지 않았습니다.');
      return root;
    },
    renderAction({
      status, event, actionId, target, receipt, observation,
      message, confirmationExpiresAt, error
    } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '보안 조치 요청 및 실제 결과');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        root.appendChild(node);
        return node;
      };
      const available = value => value !== null && value !== undefined && value !== '';
      const safe = value => {
        if (!available(value)) return '확인 불가';
        return String(value)
          .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[민감정보 생략]')
          .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [민감정보 생략]')
          .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]\s*)\S+/gi, '$1[민감정보 생략]');
      };
      const field = (label, value) => {
        if (available(value)) add('p', label + ': ' + safe(value));
      };
      const requery = () => add('p',
        '성공으로도 효과 없음으로도 판단하지 마세요. 제공 화면의 「연동 시스템 결과만 재조회」 버튼을 직접 누르세요.');
      add('h3', '보안 조치 요청 상태');

      if (status === 'idle') {
        add('p', '아직 미실행(idle). AI 제안은 실제 조치가 아닙니다.');
        if (Array.isArray(event?.supportedActions) && event.supportedActions.length === 0) {
          add('p', '현재 연동 시스템이 지원하는 조치가 없어 조치 준비 버튼이 표시되지 않는 것이 정상입니다.');
        }
        return root;
      }

      if (status === 'error') {
        add('p', '요청 처리 안 됨(error). 서버 집행 결과가 확인된 상태가 아닙니다.');
        field('오류 코드', error?.code);
        add('p', '오류 메시지: ' + safe(error?.message));
        add('p', '제공 화면에서 오류를 확인하고 직접 다시 시도하세요. 조치 실행 성공으로 판단하지 마세요.');
        return root;
      }

      // 수신 상태와 현재 사건·요청을 구분한다. 표식은 실제 상태의 입력이 있을 때만 붙인다.
      const knownStates = [
        'loading', 'prepared', 'executing', 'pending', 'succeeded',
        'denied', 'failed', 'unknown', 'expired'
      ];
      const known = knownStates.includes(status);
      if (known && available(event?.id)) {
        root.setAttribute('data-student-action-event', String(event.id));
      }
      if (known && available(receipt?.requestId)) {
        root.setAttribute('data-student-action-request', String(receipt.requestId));
      }

      const receiptEventConflict = available(event?.id) && available(receipt?.eventId) &&
        String(event.id) !== String(receipt.eventId);
      const receiptActionConflict = available(actionId) && available(receipt?.actionId) &&
        String(actionId) !== String(receipt.actionId);
      const hasConflict = receiptEventConflict || receiptActionConflict;

      if (status === 'loading') {
        add('p', '조치 준비 또는 결과 조회 중(loading). 집행 완료나 실제 효과가 확인된 상태가 아닙니다.');
      } else if (status === 'prepared') {
        add('p', '준비됨·미실행(prepared). 아직 실제 보안 조치는 실행되지 않았습니다.');
        add('p', '제공 화면의 「대상과 조치를 확인했으며 집행합니다」 버튼으로 사람이 직접 확인한 뒤에만 전달할 수 있습니다.');
        field('사람 확인 기한(confirmationExpiresAt)', confirmationExpiresAt);
      } else if (status === 'executing') {
        add('p', '서버에 전달 중(executing). 결과가 아직 없으며 조치 완료가 아닙니다.');
      } else if (status === 'pending') {
        add('p', '서버 접수·처리 중(pending). 접수 응답(ACK)은 실제 효과를 의미하지 않습니다.');
        add('p', '원천 시스템에서의 처리 결과는 아직 확인되지 않았습니다.');
      } else if (status === 'succeeded') {
        if (observation?.effectApplied === true && !hasConflict) {
          add('p', '효과 확인(succeeded). 연동 시스템이 실제 효과를 확인했습니다.');
          add('p', 'effectApplied: true');
          add('p', '관측 시각: ' + safe(observation?.observedAt));
          add('p', '효과 확인 영수증 ID: ' + safe(receipt?.receiptId));
        } else {
          add('p', '결과 불명(unknown). 효과 확인 조건을 충족하지 못했습니다.');
          requery();
        }
      } else if (status === 'denied') {
        add('p', '연동 시스템에서 조치 요청을 거절했습니다(denied). 효과 확인이 아닙니다.');
      } else if (status === 'failed') {
        add('p', '연동 시스템의 조치 처리가 실패했습니다(failed). 효과 확인이 아닙니다.');
      } else if (status === 'unknown') {
        add('p', '결과 불명(unknown). 실제 집행 결과를 확인할 수 없습니다.');
        requery();
      } else if (status === 'expired') {
        add('p', '확인 기한이 지났습니다(expired). 제공 화면에서 조치를 다시 준비하세요.');
        add('p', '기존 확인 기한으로 집행하지 마세요.');
      } else {
        add('p', '조치 상태 확인 불가. 성공 또는 미실행으로 단정할 수 없습니다.');
      }

      if (hasConflict) {
        add('p', '사건 또는 조치 식별자가 현재 요청과 일치하지 않습니다. 이 영수증으로 실제 효과를 확인할 수 없습니다.');
        requery();
      }

      field('사건 ID(event.id)', event?.id);
      if (Array.isArray(event?.evidence)) {
        for (const item of event.evidence) {
          field('사건 근거 ID(evidence.id)', item?.id);
        }
      }
      field('조치 ID(actionId)', actionId);
      field('대상 ID(target.id)', target?.id);
      field('대상 세대(target.generation)', target?.generation);
      field('영수증 사건 ID(receipt.eventId)', receipt?.eventId);
      field('영수증 조치 ID(receipt.actionId)', receipt?.actionId);
      field('요청 ID(receipt.requestId)', receipt?.requestId);
      field('접수 영수증 ID(receipt.receiptId)', receipt?.receiptId);
      field('영수증 상태(receipt.status)', receipt?.status);
      field('영수증 버전(receipt.version)', receipt?.version);
      if (receipt?.replayed !== undefined && receipt?.replayed !== null) {
        add('p', '중복 요청 여부(replayed): ' + String(receipt.replayed));
        if (receipt.replayed === true) {
          add('p', '동일 요청의 접수 결과를 재사용했습니다. 새 집행 성공을 의미하지 않습니다.');
        }
      }
      if (receipt?.superseded !== undefined && receipt?.superseded !== null) {
        add('p', '이전 요청 대체 여부(superseded): ' + String(receipt.superseded));
      }
      if (observation !== null && observation !== undefined) {
        add('p', '원천 효과 관측값(effectApplied): ' +
          (observation.effectApplied == null ? '확인 불가' : String(observation.effectApplied)));
        field('원천 관측 시각(observedAt)', observation?.observedAt);
      }
      field('안내 메시지', message);
      add('p', '이 학생 화면에는 조치 버튼이 없습니다. 제공 화면의 버튼을 직접 눌러 진행하세요.');
      add('p', '「조치 화면 취소」는 이미 서버에 전달된 효과를 되돌리지 않습니다.');
      return root;
    },
  };
}
