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

        # 1. Prioridade máxima: se __vpath__ foi injetado pelo vercel.json rewrite
        import urllib.parse
        parsed_qs = urllib.parse.parse_qs(query_string)
        if "__vpath__" in parsed_qs and parsed_qs["__vpath__"]:
            real_path = parsed_qs["__vpath__"][0]
            if real_path:
                scope["path"] = real_path
                scope["raw_path"] = real_path.encode("utf-8")
                
                # Remove __vpath__ da query_string para não poluir os endpoints do FastAPI
                filtered_qs = [(k, v) for k, vs in parsed_qs.items() if k != "__vpath__" for v in vs]
                new_qs = urllib.parse.urlencode(filtered_qs).encode("utf-8")
                scope["query_string"] = new_qs

        # 2. Fallbacks de headers
        elif matched_path := (
            headers.get(b"x-matched-path") or
            headers.get(b"x-forwarded-uri") or
            headers.get(b"x-original-uri") or
            headers.get(b"x-rewrite-url") or
            headers.get(b"x-now-route-matches")
        ):
            clean_path = matched_path.decode("utf-8", "ignore").split("?")[0]
            if clean_path and clean_path not in ["/api/index.py", "/api/index"]:
                scope["path"] = clean_path
                scope["raw_path"] = clean_path.encode("utf-8")
        elif scope.get("path") in ["/api/index.py", "/api/index"]:
            scope["path"] = "/"
            scope["raw_path"] = b"/"

    await fastapi_app(scope, receive, send)
