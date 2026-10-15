const SUPABASE_URL = 'https://hjuczlxovnghkljzygoz.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ approved: false, message: '허용되지 않은 요청입니다.' });
  }
  const authorization = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return res.status(401).json({ approved: false, message: '로그인이 필요합니다.' });
  try {
    const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
        Authorization: 'Bearer ' + match[1],
      },
    });
    if (!response.ok) return res.status(401).json({ approved: false, message: '로그인 세션을 확인할 수 없습니다.' });
    const user = await response.json();
    const allowlist = (process.env.APPROVED_DEVICE_USER_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
    const approved = Boolean(user?.id && allowlist.includes(user.id));
    if (req.method === 'POST' && !approved) {
      return res.status(202).json({ approved: false, state: 'pending', message: '승인 요청을 접수했습니다. 관리자가 서버의 등록 기기 목록에 승인 정보를 등록해야 합니다.' });
    }
    if (!approved) return res.status(403).json({ approved: false, state: 'pending', message: '이 계정은 서버에서 등록 기기로 승인되지 않았습니다. 보호 자료는 표시되지 않습니다.' });
    return res.status(200).json({ approved: true, state: 'approved' });
  } catch {
    return res.status(503).json({ approved: false, message: '기기 승인 확인 서비스를 사용할 수 없습니다.' });
  }
}
