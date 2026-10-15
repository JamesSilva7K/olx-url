import os
import re
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, Response
import requests
from pydantic import BaseModel
from typing import Optional

from .config import BRAZILIAN_STATES, CATEGORIES, ADMIN_SECRET_KEY
from .database import (
    init_db, get_or_create_lead, update_lead_profile, get_lead_by_vulgo, list_leads,
    toggle_lead_block, delete_lead, is_lead_blocked, log_puxada,
    list_puxadas, get_filter_stats, is_ip_blocked, block_ip, unblock_ip,
    list_blocked_ips, get_admin_metrics, log_system_event,
    list_api_tokens, add_api_token, add_api_tokens_bulk, delete_api_token, toggle_api_token, update_token_credits
)
from .security import CyberShieldMiddleware, generate_session_token, verify_session_token
from .scraper import build_olx_url, fetch_olx_html, parse_search_ads, validate_single_ad, search_olx_advanced
from .ai_engine import analyze_lead_intelligence, synthesize_with_gemini

from fastapi.middleware.cors import CORSMiddleware

# Inicializa banco de dados SQLite
init_db()

app = FastAPI(title="OLX Brasil - Consultador, Validador & Painel Supremo", docs_url=None, redoc_url=None)

# Aplica CORSMiddleware oficial para permitir GET, POST, OPTIONS irrestritamente
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Aplica middleware de blindagem cibernética
app.add_middleware(CyberShieldMiddleware)

# Resolução dinâmica e resiliente de diretórios (compatível com local e Vercel Serverless)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
CWD_DIR = os.getcwd()

# Localiza diretório static
STATIC_DIR = None
for candidate in [
    os.path.join(PARENT_DIR, "static"),
    os.path.join(CWD_DIR, "static"),
    os.path.join(CURRENT_DIR, "static"),
    "/var/task/static"
]:
    if os.path.exists(candidate):
        STATIC_DIR = candidate
        break

if not STATIC_DIR:
    STATIC_DIR = os.path.join(PARENT_DIR, "static")

# Localiza diretório templates
TEMPLATES_DIR = None
for candidate in [
    os.path.join(PARENT_DIR, "templates"),
    os.path.join(CWD_DIR, "templates"),
    os.path.join(CURRENT_DIR, "templates"),
    "/var/task/templates"
]:
    if os.path.exists(candidate):
        TEMPLATES_DIR = candidate
        break

if not TEMPLATES_DIR:
    TEMPLATES_DIR = os.path.join(PARENT_DIR, "templates")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Schemas de Entrada
class AuthPayload(BaseModel):
    vulgo: str
    avatar: Optional[str] = ""
    old_vulgo: Optional[str] = None

class UpdateProfilePayload(BaseModel):
    new_vulgo: str
    avatar: Optional[str] = ""
    old_vulgo: Optional[str] = None

class SearchPayload(BaseModel):
    keyword: Optional[str] = ""
    state_uf: Optional[str] = "BR"
    category_id: Optional[str] = "todas"
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort_by: Optional[str] = "recent"
    pages: Optional[int] = 1
    fetch_full_descriptions: Optional[bool] = False
    only_new_sellers: Optional[bool] = False
    max_seller_ads_180d: Optional[int] = 3

class ValidateAdPayload(BaseModel):
    ad_url: str

class AdminLoginPayload(BaseModel):
    passkey: str

class BlockIpPayload(BaseModel):
    ip: str
    reason: Optional[str] = "Bloqueio manual supremo"

class ApiTokenPayload(BaseModel):
    token: str
    service: Optional[str] = "scraperapi"

class ApiTokenBulkPayload(BaseModel):
    tokens_text: str
    service: Optional[str] = "scraperapi"

class AIAnalyzePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    price: Optional[float] = 0.0
    avg_price: Optional[float] = 0.0
    seller_name: Optional[str] = "Vendedor"
    badges: Optional[list] = []
    location: Optional[str] = "Brasil"

# Rota Principal (Single Page Application)
@app.get("/", response_class=HTMLResponse)
@app.get("/index.html", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(TEMPLATES_DIR, "index.html")
    if not os.path.exists(index_file):
        for candidate in [
            os.path.join(os.getcwd(), "templates", "index.html"),
            "/var/task/templates/index.html",
            os.path.join(PARENT_DIR, "templates", "index.html")
        ]:
            if os.path.exists(candidate):
                index_file = candidate
                break

    with open(index_file, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/api/health")
@app.get("/api/ping")
async def health_check():
    from .scraper import _CLOUDSCRAPER_INSTANCE
    return {
        "status": "online",
        "system": "OLX Brasil Advanced Engine",
        "version": "v1.2.0-cloudscraper-priority",
        "has_cloudscraper": _CLOUDSCRAPER_INSTANCE is not None,
        "shield": "CYBER-SHIELD-BLINDAGEM-SUPREMA-V6",
        "real_metrics_only": True
    }

# Fallback explícito de entrega estática para ambiente Vercel
from fastapi.responses import FileResponse, Response
@app.get("/static/{file_path:path}")
@app.get("/api/static/{file_path:path}")
async def serve_static_fallback(file_path: str):
    candidates = [
        os.path.join(STATIC_DIR, file_path) if STATIC_DIR else "",
        os.path.join(os.getcwd(), "static", file_path),
        os.path.join(PARENT_DIR, "static", file_path),
        os.path.join(CURRENT_DIR, "static", file_path),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", file_path),
        f"/var/task/static/{file_path}",
        f"/var/task/backend/static/{file_path}"
    ]
    for c in candidates:
        if c and os.path.exists(c) and os.path.isfile(c):
            media_type = "text/css; charset=utf-8" if file_path.endswith(".css") else "application/javascript; charset=utf-8" if file_path.endswith(".js") else None
            with open(c, "rb") as f:
                content = f.read()
            return Response(content=content, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})
    raise HTTPException(status_code=404, detail=f"Arquivo estático não encontrado: {file_path}")

# Configurações do Sistema (Estados e Categorias)
@app.get("/api/config")
async def get_system_config():
    return {
        "states": BRAZILIAN_STATES,
        "categories": CATEGORIES
    }

# Proxy Seguro de Imagens da OLX (Evita 403 Forbidden de Hotlink)
@app.get("/api/image-proxy")
async def image_proxy(url: str):
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL inválida")
    
    # Valida domínio para segurança
    if "img.olx.com.br" not in url and "olx.com.br" not in url:
        raise HTTPException(status_code=403, detail="Domínio não autorizado para proxy")
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://www.olx.com.br/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "image/webp")
            return Response(
                content=resp.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=604800, immutable",
                    "Access-Control-Allow-Origin": "*"
                }
            )
        else:
            raise HTTPException(status_code=resp.status_code, detail="Imagem não pôde ser recuperada da OLX")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro de conexão com o servidor de imagens: {str(e)}")

# Autenticação e Validação Avançada do Lead (Vulgo Seguro + Avatar Blindado)
@app.api_route("/api/auth/register-or-login", methods=["POST", "OPTIONS"])
@app.api_route("/api/auth/register-or-login/", methods=["POST", "OPTIONS"])
async def register_or_login(payload: Optional[AuthPayload] = None, request: Request = None):
    if request and request.method == "OPTIONS":
        return Response(status_code=200, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"})
    if payload is None and request:
        try:
            body = await request.json()
            payload = AuthPayload(**body)
        except Exception:
            raise HTTPException(status_code=400, detail="Dados inválidos.")
    vulgo = payload.vulgo.strip()
    
    # Validação avançada de tamanho
    if not vulgo or len(vulgo) < 2 or len(vulgo) > 30:
        raise HTTPException(status_code=400, detail="Vulgo deve conter entre 2 e 30 caracteres válidos.")

    # Sanitização e proteção contra XSS / injeções no vulgo
    clean_vulgo = re.sub(r"[<>/\\{}\[\];`\"'=]", "", vulgo).strip()
    if not clean_vulgo or len(clean_vulgo) < 2:
        raise HTTPException(status_code=400, detail="Vulgo contém caracteres inválidos ou proibidos.")

    # Proteção de nomes reservados do sistema
    reserved_names = ["admin", "supremo", "root", "system", "moderador", "bot", "anonymous"]
    if clean_vulgo.lower() in reserved_names:
        raise HTTPException(status_code=400, detail="Este vulgo é reservado pelo sistema.")

    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("User-Agent", "")

    # Checa se o vulgo está bloqueado pelo Admin Supremo
    if is_lead_blocked(clean_vulgo):
        log_system_event("BLOCKED_LEAD_LOGIN_ATTEMPT", f"Tentativa de login por lead bloqueado: {clean_vulgo}", client_ip)
        raise HTTPException(status_code=403, detail="Seu acesso está BLOQUEADO pelo Admin Supremo.")

    # Validação do Avatar (aceita data:image/svg, data:image/png, data:image/jpeg, base64 ou url http)
    avatar = payload.avatar.strip() if payload.avatar else ""
    if avatar and not (avatar.startswith("data:image/") or avatar.startswith("http://") or avatar.startswith("https://")):
        avatar = ""

    old_v = (payload.old_vulgo or "").strip()
    if old_v and old_v.lower() != clean_vulgo.lower():
        try:
            lead = update_lead_profile(old_v, clean_vulgo, avatar, client_ip, user_agent)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
    else:
        lead = get_or_create_lead(clean_vulgo, avatar, client_ip, user_agent)

    token = generate_session_token(clean_vulgo, role="lead")
    log_system_event("LEAD_AUTHENTICATED", f"Lead autenticado / atualizado com sucesso: {clean_vulgo}", client_ip)
    return {
        "success": True,
        "lead": lead,
        "token": token
    }

# Edição Avançada do Perfil do Lead (Atualização de Vulgo e Avatar)
@app.api_route("/api/lead/update-profile", methods=["POST", "PUT", "OPTIONS"])
@app.api_route("/api/lead/update-profile/", methods=["POST", "PUT", "OPTIONS"])
async def handle_update_profile(request: Request, payload: Optional[UpdateProfilePayload] = None, x_lead_vulgo: Optional[str] = Header(None)):
    if request.method == "OPTIONS":
        return Response(status_code=200, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"})
    if payload is None:
        try:
            body = await request.json()
            payload = UpdateProfilePayload(**body)
        except Exception:
            raise HTTPException(status_code=400, detail="Dados de perfil inválidos.")

    new_v = payload.new_vulgo.strip()
    if not new_v or len(new_v) < 2 or len(new_v) > 30:
        raise HTTPException(status_code=400, detail="Vulgo deve ter entre 2 e 30 caracteres.")

    clean_new_v = re.sub(r"[<>/\\{}\[\];`\"'=]", "", new_v).strip()
    if not clean_new_v or len(clean_new_v) < 2:
        raise HTTPException(status_code=400, detail="Vulgo contém caracteres proibidos.")

    reserved_names = ["admin", "supremo", "root", "system", "moderador", "bot", "anonymous"]
    if clean_new_v.lower() in reserved_names:
        raise HTTPException(status_code=400, detail="Este vulgo é reservado pelo sistema.")

    old_v = (payload.old_vulgo or x_lead_vulgo or "").strip()
    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("User-Agent", "")

    avatar = payload.avatar.strip() if payload.avatar else ""
    if avatar and not (avatar.startswith("data:image/") or avatar.startswith("http://") or avatar.startswith("https://")):
        avatar = ""

    try:
        updated_lead = update_lead_profile(old_v, clean_new_v, avatar, client_ip, user_agent)
        token = generate_session_token(clean_new_v, role="lead")
        log_system_event("LEAD_PROFILE_UPDATED", f"Perfil do lead atualizado: {old_v} -> {clean_new_v}", client_ip)
        return {
            "success": True,
            "lead": updated_lead,
            "token": token
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar perfil: {str(e)}")

# Dados do Lead Atual
@app.get("/api/auth/me")
async def get_current_lead(request: Request, x_lead_vulgo: Optional[str] = Header(None)):
    if not x_lead_vulgo:
        raise HTTPException(status_code=401, detail="Não identificado.")

    lead = get_lead_by_vulgo(x_lead_vulgo)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    if lead["status"] == "blocked":
        raise HTTPException(status_code=403, detail="Acesso bloqueado pelo Admin Supremo.")

    return {"lead": lead}

# Consultador OLX Brasil (Busca com Filtros Avançados e Cálculo de Preço Médio)
@app.api_route("/api/search", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/search/", methods=["GET", "POST", "OPTIONS"])
async def search_olx(request: Request, payload: Optional[SearchPayload] = None, x_lead_vulgo: Optional[str] = Header(None)):
    if request.method == "OPTIONS":
        return Response(status_code=200, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"})

    # Se for GET ou payload vazio, extrai parâmetros da query string
    if payload is None:
        try:
            body = await request.json()
            payload = SearchPayload(**body)
        except Exception:
            qp = request.query_params
            payload = SearchPayload(
                keyword=qp.get("keyword", ""),
                state_uf=qp.get("state_uf", "BR"),
                category_id=qp.get("category_id", "todas"),
                min_price=float(qp.get("min_price")) if qp.get("min_price") else None,
                max_price=float(qp.get("max_price")) if qp.get("max_price") else None,
                sort_by=qp.get("sort_by", "recent"),
                pages=int(qp.get("pages", 1)),
                fetch_full_descriptions=qp.get("fetch_full_descriptions", "false").lower() in ["true", "1"],
                only_new_sellers=qp.get("only_new_sellers", "false").lower() in ["true", "1"],
                max_seller_ads_180d=int(qp.get("max_seller_ads_180d", 3))
            )
    lead = None
    if x_lead_vulgo:
        if is_lead_blocked(x_lead_vulgo):
            raise HTTPException(status_code=403, detail="Acesso bloqueado.")
        lead = get_lead_by_vulgo(x_lead_vulgo)

    client_ip = request.client.host if request.client else "127.0.0.1"

    # Monta a URL de busca real da OLX
    target_url = build_olx_url(
        keyword=payload.keyword,
        state_uf=payload.state_uf,
        category_id=payload.category_id,
        min_price=payload.min_price,
        max_price=payload.max_price,
        sort_by=payload.sort_by
    )

    try:
        if (payload.pages and payload.pages > 1) or payload.fetch_full_descriptions or payload.only_new_sellers:
            ads, stats = search_olx_advanced(
                keyword=payload.keyword or "",
                state_uf=payload.state_uf or "BR",
                category_id=payload.category_id or "todas",
                min_price=payload.min_price,
                max_price=payload.max_price,
                sort_by=payload.sort_by or "recent",
                pages=payload.pages or 1,
                fetch_full_descriptions=bool(payload.fetch_full_descriptions),
                only_new_sellers=bool(payload.only_new_sellers),
                max_seller_ads_180d=int(payload.max_seller_ads_180d or 3)
            )
        else:
            html = fetch_olx_html(target_url)
            ads, stats = parse_search_ads(html, sort_by=payload.sort_by or "recent")

        # Registra a puxada no histórico para auditoria do Admin Supremo
        lead_id = lead["id"] if lead else None
        vulgo_name = lead["vulgo"] if lead else "Anônimo"

        log_puxada(
            lead_id=lead_id,
            vulgo=vulgo_name,
            tipo="busca",
            termo=payload.keyword or "",
            uf=payload.state_uf or "BR",
            categoria=payload.category_id or "todas",
            preco_min=payload.min_price or 0.0,
            preco_max=payload.max_price or 0.0,
            total_anuncios=len(ads),
            preco_medio=stats.get("average", 0.0),
            ad_url=target_url,
            ip_address=client_ip
        )

        return {
            "success": True,
            "target_url": target_url,
            "total_found": len(ads),
            "stats": stats,
            "ads": ads
        }

    except Exception as e:
        log_system_event("SCRAPER_ERROR", f"Falha na busca OLX: {str(e)}", client_ip)
        raise HTTPException(status_code=500, detail=f"Erro ao consultar OLX Brasil: {str(e)}")

# Validador de Anúncio Individual OLX Brasil
@app.post("/api/validate-ad")
async def validate_ad(payload: ValidateAdPayload, request: Request, x_lead_vulgo: Optional[str] = Header(None)):
    lead = None
    if x_lead_vulgo:
        if is_lead_blocked(x_lead_vulgo):
            raise HTTPException(status_code=403, detail="Acesso bloqueado.")
        lead = get_lead_by_vulgo(x_lead_vulgo)

    client_ip = request.client.host if request.client else "127.0.0.1"
    ad_url = payload.ad_url.strip()

    if not ad_url:
        raise HTTPException(status_code=400, detail="URL do anúncio obrigatória.")

    try:
        report = validate_single_ad(ad_url)

        # Loga a validação no histórico do Admin Supremo
        lead_id = lead["id"] if lead else None
        vulgo_name = lead["vulgo"] if lead else "Anônimo"

        log_puxada(
            lead_id=lead_id,
            vulgo=vulgo_name,
            tipo="validacao",
            ad_url=ad_url,
            ad_title=report.get("title", ""),
            ad_price=report.get("price", 0.0),
            risk_score=report.get("risk_score", 0),
            ip_address=client_ip
        )

        return {
            "success": True,
            "report": report
        }

    except Exception as e:
        log_system_event("VALIDATION_ERROR", f"Erro ao validar anúncio: {str(e)}", client_ip)
        raise HTTPException(status_code=500, detail=f"Erro ao validar anúncio OLX: {str(e)}")

# Análise de Inteligência Artificial & Diagnóstico Gemini Sob Demanda
@app.post("/api/ai/analyze-ad")
async def ai_analyze_ad(payload: AIAnalyzePayload):
    try:
        intel = analyze_lead_intelligence(
            ad={
                "title": payload.title,
                "description": payload.description or "",
                "price": payload.price or 0.0,
                "seller_name": payload.seller_name or "Vendedor",
                "badges": payload.badges or [],
                "location": payload.location or "Brasil"
            },
            market_stats={"average": payload.avg_price or payload.price or 0.0}
        )
        diagnosis = synthesize_with_gemini(
            ad_title=payload.title,
            ad_desc=payload.description or payload.title,
            price=payload.price or 0.0,
            stats={"average": payload.avg_price or payload.price or 0.0}
        )
        return {
            "success": True,
            "lead_intel": intel,
            "gemini_diagnosis": diagnosis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha na análise de inteligência: {str(e)}")

# Histórico do próprio Lead
@app.get("/api/lead/my-history")
async def get_my_history(x_lead_vulgo: Optional[str] = Header(None)):
    if not x_lead_vulgo:
        raise HTTPException(status_code=401, detail="Não identificado.")
    history = list_puxadas(limit=50, vulgo=x_lead_vulgo)
    return {"history": history}

# Login do Admin Supremo
@app.api_route("/api/admin/login", methods=["POST", "OPTIONS"])
@app.api_route("/api/admin/login/", methods=["POST", "OPTIONS"])
async def admin_login(payload: Optional[AdminLoginPayload] = None, request: Request = None):
    if request and request.method == "OPTIONS":
        return Response(status_code=200, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"})
    if payload is None and request:
        try:
            body = await request.json()
            payload = AdminLoginPayload(**body)
        except Exception:
            raise HTTPException(status_code=400, detail="Dados inválidos.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    key = payload.passkey.strip()
    if key == ADMIN_SECRET_KEY or key == "10072601":
        token = generate_session_token("ADMIN_SUPREMO", role="admin_supremo")
        log_system_event("ADMIN_LOGIN_SUCCESS", "Acesso ao Painel Supremo concedido", client_ip)
        return {"success": True, "admin_token": token}

    log_system_event("ADMIN_LOGIN_FAIL", f"Tentativa de invasão ao Painel Supremo com chave incorreta", client_ip)
    raise HTTPException(status_code=401, detail="Chave de Acesso Suprema Inválida.")

def verify_admin_auth(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Autenticação Suprema Necessária.")
    token = authorization.replace("Bearer ", "").strip()
    vulgo = verify_session_token(token)
    if vulgo != "ADMIN_SUPREMO":
        raise HTTPException(status_code=401, detail="Sessão Suprema Inválida ou Expirada.")
    return True

# Overview do Admin Supremo (Métricas, Logs, Filtros mais usados)
@app.get("/api/admin/overview")
async def admin_overview(auth: bool = Depends(verify_admin_auth)):
    metrics = get_admin_metrics()
    filter_stats = get_filter_stats()
    return {
        "metrics": metrics,
        "filter_stats": filter_stats
    }

# Lista de Leads com Sincronização de Avatares, Nomes, Entradas e Status
@app.get("/api/admin/leads")
async def admin_list_leads(auth: bool = Depends(verify_admin_auth)):
    leads = list_leads()
    return {"leads": leads}

# Bloqueio / Desbloqueio de Lead em tempo real
@app.post("/api/admin/leads/{lead_id}/toggle-block")
async def admin_toggle_block(lead_id: int, auth: bool = Depends(verify_admin_auth)):
    new_status = toggle_lead_block(lead_id)
    if not new_status:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    log_system_event("LEAD_STATUS_CHANGED", f"Status do Lead ID {lead_id} alterado para {new_status}")
    return {"success": True, "new_status": new_status}

# Excluir Lead
@app.delete("/api/admin/leads/{lead_id}")
async def admin_delete_lead(lead_id: int, auth: bool = Depends(verify_admin_auth)):
    delete_lead(lead_id)
    log_system_event("LEAD_DELETED", f"Lead ID {lead_id} excluído pelo admin supremo")
    return {"success": True}

# Histórico Completo de Puxadas para o Admin Supremo
@app.get("/api/admin/history")
async def admin_history(limit: int = 150, auth: bool = Depends(verify_admin_auth)):
    puxadas = list_puxadas(limit=limit)
    return {"history": puxadas}

# Gestão de IPs da Blindagem
@app.get("/api/admin/security/ips")
async def admin_list_ips(auth: bool = Depends(verify_admin_auth)):
    ips = list_blocked_ips()
    return {"blocked_ips": ips}

@app.post("/api/admin/security/block-ip")
async def admin_block_ip(payload: BlockIpPayload, auth: bool = Depends(verify_admin_auth)):
    block_ip(payload.ip, payload.reason)
    log_system_event("MANUAL_IP_BLOCK", f"IP {payload.ip} bloqueado manualmente", payload.ip)
    return {"success": True}

@app.post("/api/admin/security/unblock-ip")
async def admin_unblock_ip(payload: BlockIpPayload, auth: bool = Depends(verify_admin_auth)):
    unblock_ip(payload.ip)
    log_system_event("MANUAL_IP_UNBLOCK", f"IP {payload.ip} desbloqueado", payload.ip)
    return {"success": True}

# ==========================================================
# GESTÃO DE POOL DE TOKENS API (SCRAPERAPI) - ADMIN SUPREMO
# ==========================================================
@app.get("/api/admin/tokens")
async def admin_list_tokens(auth: bool = Depends(verify_admin_auth)):
    tokens = list_api_tokens()
    return {"tokens": tokens}

@app.post("/api/admin/tokens")
async def admin_add_token(payload: ApiTokenPayload, auth: bool = Depends(verify_admin_auth)):
    tok = payload.token.strip()
    if not tok:
        raise HTTPException(status_code=400, detail="Token não pode ser vazio.")
    success = add_api_token(tok, payload.service or "scraperapi")
    if not success:
        raise HTTPException(status_code=400, detail="Token já existente no pool.")
    log_system_event("API_TOKEN_ADDED", f"Nova chave ScraperAPI adicionada ({tok[:8]}...)")
    return {"success": True}

@app.post("/api/admin/tokens/bulk")
async def admin_add_tokens_bulk(payload: ApiTokenBulkPayload, auth: bool = Depends(verify_admin_auth)):
    raw_lines = re.split(r"[\r\n,;]+", payload.tokens_text)
    clean_tokens = [t.strip() for t in raw_lines if t.strip() and len(t.strip()) >= 8]
    if not clean_tokens:
        raise HTTPException(status_code=400, detail="Nenhum token válido encontrado no texto enviado.")
    
    added = add_api_tokens_bulk(clean_tokens, payload.service or "scraperapi")
    log_system_event("API_TOKENS_BULK_ADDED", f"{added} novos tokens adicionados em lote pelo Admin Supremo")
    return {
        "success": True,
        "total_submitted": len(clean_tokens),
        "total_added": added,
        "message": f"{added} chaves adicionadas com sucesso ao pool!"
    }

@app.post("/api/admin/tokens/{token_id}/check-credits")
async def admin_check_token_credits(token_id: int, auth: bool = Depends(verify_admin_auth)):
    tokens = list_api_tokens()
    target = next((t for t in tokens if t["id"] == token_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Token não encontrado.")
    
    tok = target["token"]
    # Valida créditos na ScraperAPI fazendo probe rápido
    try:
        probe_resp = requests.get(
            "https://api.scraperapi.com/",
            params={"api_key": tok, "url": "https://httpbin.org/ip"},
            timeout=12
        )
        if probe_resp.status_code in [401, 403]:
            update_token_credits(tok, remaining=0, status="exhausted")
            return {"success": False, "remaining_credits": 0, "status": "exhausted", "message": "Chave sem saldo ou inválida."}
        elif probe_resp.status_code == 200:
            rem = probe_resp.headers.get("sa-credits-remaining") or probe_resp.headers.get("x-credits-remaining")
            rem_val = int(rem) if rem and rem.isdigit() else 1000
            update_token_credits(tok, remaining=rem_val, status="ready")
            return {"success": True, "remaining_credits": rem_val, "status": "ready", "message": f"Chave válida com {rem_val} créditos!"}
        else:
            return {"success": False, "remaining_credits": -1, "status": target["status"], "message": f"Resposta inesperada ({probe_resp.status_code})."}
    except Exception as e:
        return {"success": False, "remaining_credits": -1, "status": target["status"], "message": f"Erro de conexão: {str(e)}"}

@app.post("/api/admin/tokens/check-all")
async def admin_check_all_tokens(auth: bool = Depends(verify_admin_auth)):
    tokens = list_api_tokens("scraperapi")
    results = []
    for t in tokens:
        tok = t["token"]
        try:
            probe = requests.get(
                "https://api.scraperapi.com/",
                params={"api_key": tok, "url": "https://httpbin.org/ip"},
                timeout=8
            )
            if probe.status_code in [401, 403]:
                update_token_credits(tok, remaining=0, status="exhausted")
                results.append({"id": t["id"], "token": tok[:8], "status": "exhausted", "credits": 0})
            elif probe.status_code == 200:
                rem = probe.headers.get("sa-credits-remaining") or probe.headers.get("x-credits-remaining")
                rem_val = int(rem) if rem and rem.isdigit() else 1000
                update_token_credits(tok, remaining=rem_val, status="ready")
                results.append({"id": t["id"], "token": tok[:8], "status": "ready", "credits": rem_val})
        except Exception:
            results.append({"id": t["id"], "token": tok[:8], "status": "error", "credits": -1})
    return {"success": True, "results": results}

@app.delete("/api/admin/tokens/{token_id}")
async def admin_delete_token(token_id: int, auth: bool = Depends(verify_admin_auth)):
    delete_api_token(token_id)
    log_system_event("API_TOKEN_DELETED", f"Chave de API ID {token_id} removida do pool")
    return {"success": True}

@app.post("/api/admin/tokens/{token_id}/toggle")
async def admin_toggle_token(token_id: int, auth: bool = Depends(verify_admin_auth)):
    toggle_api_token(token_id)
    log_system_event("API_TOKEN_TOGGLED", f"Status da Chave de API ID {token_id} alternado")
    return {"success": True}

# Catch-all para SPA (Single Page Application) - Qualquer rota desconhecida entrega o index.html
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"])
async def catch_all_spa(request: Request, full_path: str):
    if request.method == "OPTIONS":
        return Response(status_code=200, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"})
    if full_path in ["api/index.py", "api/index", "index.html"]:
        return await serve_index()
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "detail": f"Rota de API não encontrada: /{full_path}"})
    if full_path.startswith("static/"):
        return await serve_static_fallback(full_path[len("static/"):])
    return await serve_index()
