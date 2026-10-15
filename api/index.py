from backend.app import app as fastapi_app
import json

async def app(scope, receive, send):
    if scope["type"] == "http":
        headers = dict(scope.get("headers", []))
        
        # Modo de auto-diagnostico para verificar headers que o Vercel realmente entrega
        query_string = scope.get("query_string", b"").decode("utf-8")
        if "debug_scope=1" in query_string:
            hdr_dict = {k.decode('latin-1'): v.decode('latin-1') for k, v in scope.get("headers", [])}
            body = json.dumps({
                "scope_path": scope.get("path"),
                "query_string": query_string,
                "headers": hdr_dict
            }, indent=2).encode("utf-8")
            
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("utf-8"))
                ]
            })
            await send({
                "type": "http.response.body",
                "body": body
            })
            return

        # Busca caminho original em qualquer um dos headers injetados por proxies/Vercel
        matched_path = (
            headers.get(b"x-matched-path") or
            headers.get(b"x-forwarded-uri") or
            headers.get(b"x-original-uri") or
            headers.get(b"x-rewrite-url") or
            headers.get(b"x-now-route-matches")
        )
        if matched_path:
            clean_path = matched_path.decode("utf-8", "ignore").split("?")[0]
            if clean_path and clean_path not in ["/api/index.py", "/api/index"]:
                scope["path"] = clean_path
                scope["raw_path"] = clean_path.encode("utf-8")
            elif clean_path in ["/api/index.py", "/api/index"]:
                # Se veio para /api/index.py mas a requisição original era /api/..., preserva scope["path"]
                original_url = headers.get(b"x-url") or headers.get(b"x-real-url")
                if original_url:
                    clean_orig = original_url.decode("utf-8", "ignore").split("?")[0]
                    if clean_orig.startswith("/api/"):
                        scope["path"] = clean_orig
                        scope["raw_path"] = clean_orig.encode("utf-8")
        elif scope.get("path") in ["/api/index.py", "/api/index"]:
            scope["path"] = "/"
            scope["raw_path"] = b"/"

    await fastapi_app(scope, receive, send)
