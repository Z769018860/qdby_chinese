module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const uid = String(req.query?.uid || '').trim();
  const tid = String(req.query?.tid || '').trim();
  if (!/^\d{5,20}$/.test(uid) || !/^\d{1,12}$/.test(tid)) {
    res.status(400).json({ ok: false, message: 'invalid uid or tid' });
    return;
  }

  try {
    const url = new URL('https://eremora.com/api/showcase');
    url.searchParams.set('uid', uid);
    url.searchParams.set('tid', tid);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; qingdengbuyi-morimens-tools/1.0)',
        Referer: 'https://eremora.com/',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      res.status(502).json({
        ok: false,
        message: 'Eremora Showcase request failed',
        upstreamStatus: response.status,
      });
      return;
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (error) {
    console.error('Morimens Showcase proxy error:', error);
    res.status(502).json({ ok: false, message: 'Eremora Showcase temporarily unavailable' });
  }
};
