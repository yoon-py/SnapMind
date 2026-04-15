const express = require("express");

function renderCallbackPage(returnScheme) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#FCFBF7;color:#321007;text-align:center}
.box{padding:40px}.check{font-size:48px;margin-bottom:16px}.msg{font-size:18px;font-weight:600}.sub{font-size:14px;color:#7A6452;margin-top:8px}</style></head>
<body><div class="box"><div class="check">&#10003;</div><div class="msg">로그인 성공!</div><div class="sub">잠시만 기다려주세요...</div></div>
<script>
(function(){
  var h=window.location.hash.substring(1);
  if(!h)return;
  var p=new URLSearchParams(h);
  var at=p.get("access_token"),rt=p.get("refresh_token");
  if(!at)return;
  var s=new URLSearchParams(window.location.search).get("state")||"";
  fetch("/auth/store-session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({state:s,access_token:at,refresh_token:rt})})
  .then(function(){
    window.location.href="${returnScheme}";
  });
})();
</script></body></html>`;
}

function createAuthRouter({ sessionStore }) {
  const router = express.Router();

  router.get("/callback", (request, response) => {
    const returnScheme = request.query.returnScheme || "exp://192.168.0.33:8081";
    response.send(renderCallbackPage(returnScheme));
  });

  router.post("/store-session", (request, response) => {
    const { state, access_token, refresh_token } = request.body || {};
    if (!state || !access_token) {
      response.status(400).json({ error: "missing" });
      return;
    }

    sessionStore.set(state, { access_token, refresh_token });
    response.json({ ok: true });
  });

  router.get("/get-session/:state", (request, response) => {
    const entry = sessionStore.consume(request.params.state);
    if (!entry) {
      response.status(404).json({ error: "not_found" });
      return;
    }

    response.json(entry);
  });

  return router;
}

module.exports = {
  createAuthRouter,
};
