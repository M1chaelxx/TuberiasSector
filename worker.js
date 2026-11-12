export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    let response = await env.ASSETS.fetch(request)

    // If path not found, serve index.html (SPA fallback)
    if (response.status === 404) {
      response = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString()))
    }

    const ct = response.headers.get('content-type') || ''
    const isHtml = ct.includes('text/html')
    // Hashed assets: filename contains 8+ hex chars (Vite fingerprinting)
    const isHashedAsset = /[a-f0-9]{8,}/.test(url.pathname) && !isHtml

    const headers = new Headers(response.headers)
    if (isHtml) {
      // Always fetch fresh HTML so users get new deployments immediately
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    } else if (isHashedAsset) {
      // Hashed assets never change — cache forever
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    }

    return new Response(response.body, { status: response.status, headers })
  },
}
