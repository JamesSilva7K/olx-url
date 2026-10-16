import sqlite3
import datetime
import os
from typing import Optional
from .config import DB_PATH, DEFAULT_AVATAR_URI


def get_connection():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")

    # Tabela de Leads / Usuários
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vulgo TEXT UNIQUE NOT NULL,
        avatar TEXT NOT NULL,
        role TEXT DEFAULT 'lead',
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL,
        last_login TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        total_queries INTEGER DEFAULT 0
    );
    """)

    # Tabela de Puxadas / Histórico de buscas e validações
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS puxadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        vulgo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        termo TEXT,
        uf TEXT,
        categoria TEXT,
        preco_min REAL,
        preco_max REAL,
        total_anuncios INTEGER,
        preco_medio REAL,
        ad_url TEXT,
        ad_title TEXT,
        ad_price REAL,
        risk_score INTEGER,
        ip_address TEXT,
        timestamp TEXT NOT NULL
    );
    """)

    # Tabela de IPs Bloqueados (Blindagem)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS blocked_ips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT UNIQUE NOT NULL,
        reason TEXT,
        blocked_at TEXT NOT NULL
    );
    """)

    # Tabela de Eventos de Segurança / Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        detail TEXT,
        ip TEXT,
        timestamp TEXT NOT NULL
    );
    """)

    # Tabela de Pool de Chaves / Tokens de API (Auto-Rotação, Prioridade & Quota Fallover)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        service TEXT DEFAULT 'scraperapi',
        role TEXT DEFAULT 'primary',
        priority INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        status TEXT DEFAULT 'ready',
        requests_count INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0,
        remaining_credits INTEGER DEFAULT -1,
        total_credits INTEGER DEFAULT -1,
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        details TEXT DEFAULT ''
    );
    """)

    # Tabela de Configurações Globais do Sistema (Motor Primário e Secundário de Raspagem)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # Migração automática de colunas caso api_tokens já existisse
    cursor.execute("PRAGMA table_info(api_tokens)")
    existing_cols = [row["name"] for row in cursor.fetchall()]
    if "remaining_credits" not in existing_cols:
        try:
            cursor.execute("ALTER TABLE api_tokens ADD COLUMN remaining_credits INTEGER DEFAULT -1")
            cursor.execute("ALTER TABLE api_tokens ADD COLUMN total_credits INTEGER DEFAULT -1")
            cursor.execute("ALTER TABLE api_tokens ADD COLUMN last_checked_at TEXT")
        except Exception:
            pass
    if "details" not in existing_cols:
        try:
            cursor.execute("ALTER TABLE api_tokens ADD COLUMN details TEXT DEFAULT ''")
        except Exception:
            pass
    if "role" not in existing_cols:
        try:
            cursor.execute("ALTER TABLE api_tokens ADD COLUMN role TEXT DEFAULT 'primary'")
        except Exception:
            pass
    if "priority" not in existing_cols:
        try:
            cursor.execute("ALTER TABLE api_tokens ADD COLUMN priority INTEGER DEFAULT 1")
        except Exception:
            pass

    # Inicializa configurações padrão dos Motores de Busca e Raspagem
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    default_settings = [
        ("primary_engine", "geckoapi"),         # Gecko API como principal solicitada pelo usuário
        ("secondary_engine", "scraperapi"),     # Scraper API como secundária/fallover
        ("geckoapi_target", "olx.com.br"),
        ("theme_mode", "dark")                  # Suporte aos temas dark e white
    ]
    for k, v in default_settings:
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)", (k, v, now_str))

    # Injeta e atualiza o pool de tokens de alta fidelidade fornecidos pelo usuário
    initial_tokens = [
        # Gecko API Tokens (Motor Primário com rotação e prioridades 1, 2, 3)
        ("pk_live_j4adq4Druop5ZXtPOrOAP5MIHSufn504", "geckoapi", "primary", 1, 10000, "Gecko API Primária #1"),
        ("pk_live_VtY--1rj36T7pcMe0jf_xBL6ixkkA5ip", "geckoapi", "primary", 2, 10000, "Gecko API Primária #2"),
        ("pk_live_hk2i9R3ybkwiZd4Ju9tdwKVqCQpCTzvS", "geckoapi", "primary", 3, 10000, "Gecko API Primária #3"),
        # Scraper API Tokens (Motor Secundário / Fallover com prioridades 1, 2, 3)
        ("1b19c32cf9891768e5da3bb46df3167c", "scraperapi", "secondary", 1, 5000, "ScraperAPI Secundária #1"),
        ("8cc0009c255fbf2474860cb8431aca8e", "scraperapi", "secondary", 2, 5000, "ScraperAPI Secundária #2"),
        ("db041394a5ba5f230cba0efe9e43f92b", "scraperapi", "secondary", 3, 5000, "ScraperAPI Secundária #3"),
    ]
    for tok, srv, role, prio, creds, desc in initial_tokens:
        cursor.execute("""
        INSERT INTO api_tokens (token, service, role, priority, is_active, status, requests_count, remaining_credits, total_credits, details, created_at)
        VALUES (?, ?, ?, ?, 1, 'ready', 0, ?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
            service = excluded.service,
            role = excluded.role,
            priority = excluded.priority,
            is_active = 1,
            details = excluded.details
        """, (tok, srv, role, prio, creds, creds, desc, now_str))

    # Auto-correção de avatares corrompidos ou mockados na inicialização
    cursor.execute("""
        UPDATE leads 
        SET avatar = ? 
        WHERE avatar IS NULL 
           OR avatar = '' 
           OR avatar = 'avatar1' 
           OR length(avatar) < 60
           OR avatar LIKE '%test%'
           OR avatar LIKE '%<svg></svg>%'
    """, (DEFAULT_AVATAR_URI,))

    conn.commit()
    conn.close()

def get_or_create_lead(vulgo: str, avatar: str, ip: str = "127.0.0.1", user_agent: str = ""):
    conn = get_connection()
    cursor = conn.cursor()
    vulgo = vulgo.strip()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    cursor.execute("SELECT * FROM leads WHERE vulgo = ? COLLATE NOCASE", (vulgo,))
    row = cursor.fetchone()

    if row:
        lead_vulgo = row["vulgo"]
        # Se usuário já existe, atualiza last_login e avatar (se fornecido novo)
        cursor.execute("""
            UPDATE leads 
            SET last_login = ?, ip_address = ?, user_agent = ?,
                avatar = CASE WHEN ? != '' THEN ? ELSE avatar END
            WHERE id = ?
        """, (now_str, ip, user_agent, avatar, avatar, row["id"]))
        conn.commit()
        cursor.execute("SELECT * FROM leads WHERE id = ?", (row["id"],))
        lead = dict(cursor.fetchone())
    else:
        cursor.execute("""
            INSERT INTO leads (vulgo, avatar, role, status, created_at, last_login, ip_address, user_agent, total_queries)
            VALUES (?, ?, 'lead', 'active', ?, ?, ?, ?, 0)
        """, (vulgo, avatar or DEFAULT_AVATAR_URI, now_str, now_str, ip, user_agent))

        conn.commit()
        cursor.execute("SELECT * FROM leads WHERE vulgo = ? COLLATE NOCASE", (vulgo,))
        lead = dict(cursor.fetchone())

    conn.close()
    return lead

def update_lead_profile(old_vulgo: str, new_vulgo: str, avatar: str = "", ip: str = "127.0.0.1", user_agent: str = ""):
    """Atualiza o perfil do lead (vulgo e/ou avatar) garantindo unicidade e preservando histórico."""
    conn = get_connection()
    cursor = conn.cursor()
    old_vulgo = (old_vulgo or "").strip()
    new_vulgo = (new_vulgo or old_vulgo).strip()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    row = None
    if old_vulgo:
        cursor.execute("SELECT * FROM leads WHERE vulgo = ? COLLATE NOCASE", (old_vulgo,))
        row = cursor.fetchone()

    if not row and new_vulgo:
        cursor.execute("SELECT * FROM leads WHERE vulgo = ? COLLATE NOCASE", (new_vulgo,))
        row = cursor.fetchone()

    if row:
        lead_id = row["id"]
        # Se alterou o vulgo, valida se o novo vulgo já pertence a outro usuário
        if new_vulgo.lower() != row["vulgo"].lower():
            cursor.execute("SELECT id FROM leads WHERE vulgo = ? COLLATE NOCASE AND id != ?", (new_vulgo, lead_id))
            if cursor.fetchone():
                conn.close()
                raise ValueError("Este vulgo já está em uso por outro operador.")

        cursor.execute("""
            UPDATE leads 
            SET vulgo = ?,
                avatar = CASE WHEN ? != '' THEN ? ELSE avatar END,
                last_login = ?,
                ip_address = ?,
                user_agent = ?
            WHERE id = ?
        """, (new_vulgo, avatar, avatar, now_str, ip, user_agent, lead_id))

        # Atualiza puxadas do vulgo antigo para o novo
        cursor.execute("UPDATE puxadas SET vulgo = ? WHERE vulgo = ? COLLATE NOCASE", (new_vulgo, row["vulgo"]))
        conn.commit()

        cursor.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
        updated = dict(cursor.fetchone())
        conn.close()
        return updated
    else:
        conn.close()
        return get_or_create_lead(new_vulgo, avatar, ip, user_agent)

def get_lead_by_vulgo(vulgo: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM leads WHERE vulgo = ? COLLATE NOCASE", (vulgo.strip(),))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def list_leads():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM leads ORDER BY id DESC")
    raw_leads = [dict(r) for r in cursor.fetchall()]
    conn.close()

    now = datetime.datetime.now()
    leads = []
    for l in raw_leads:
        is_online = False
        last_seen_str = l.get("last_login") or l.get("created_at") or ""
        if last_seen_str:
            try:
                # Format: DD/MM/YYYY HH:MM:SS
                dt = datetime.datetime.strptime(last_seen_str, "%d/%m/%Y %H:%M:%S")
                diff_seconds = (now - dt).total_seconds()
                # Consider online if active within last 10 minutes (600s)
                if 0 <= diff_seconds <= 600:
                    is_online = True
            except Exception:
                pass
        l["is_online"] = is_online
        leads.append(l)

    return leads

def toggle_lead_block(lead_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM leads WHERE id = ?", (lead_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    new_status = "blocked" if row["status"] == "active" else "active"
    cursor.execute("UPDATE leads SET status = ? WHERE id = ?", (new_status, lead_id))
    conn.commit()
    conn.close()
    return new_status

def delete_lead(lead_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    conn.commit()
    conn.close()
    return True

def promote_lead_to_supreme_admin(vulgo: str) -> bool:
    """Consolida e define este lead como o Admin Supremo do sistema."""
    if not vulgo:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE leads SET role = 'lead' WHERE role = 'admin_supremo'")
    cursor.execute("UPDATE leads SET role = 'admin_supremo' WHERE vulgo = ? COLLATE NOCASE", (vulgo.strip(),))
    conn.commit()
    conn.close()
    return True

def is_lead_blocked(vulgo: str) -> bool:
    if not vulgo:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM leads WHERE vulgo = ? COLLATE NOCASE", (vulgo.strip(),))
    row = cursor.fetchone()
    conn.close()
    if row and row["status"] == "blocked":
        return True
    return False

def increment_lead_queries(vulgo: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE leads SET total_queries = total_queries + 1 WHERE vulgo = ?", (vulgo,))
    conn.commit()
    conn.close()

def log_puxada(lead_id: int, vulgo: str, tipo: str, termo: str = "", uf: str = "", categoria: str = "",
                preco_min: float = 0.0, preco_max: float = 0.0, total_anuncios: int = 0,
                preco_medio: float = 0.0, ad_url: str = "", ad_title: str = "",
                ad_price: float = 0.0, risk_score: int = 0, ip_address: str = ""):
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    cursor.execute("""
    INSERT INTO puxadas (
        lead_id, vulgo, tipo, termo, uf, categoria, preco_min, preco_max,
        total_anuncios, preco_medio, ad_url, ad_title, ad_price, risk_score,
        ip_address, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        lead_id, vulgo, tipo, termo, uf, categoria, preco_min, preco_max,
        total_anuncios, preco_medio, ad_url, ad_title, ad_price, risk_score,
        ip_address, now_str
    ))
    conn.commit()

    if vulgo:
        cursor.execute("UPDATE leads SET total_queries = total_queries + 1 WHERE vulgo = ?", (vulgo,))
        conn.commit()

    conn.close()

def list_puxadas(limit: int = 150, vulgo: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if vulgo:
        cursor.execute("SELECT * FROM puxadas WHERE vulgo = ? ORDER BY id DESC LIMIT ?", (vulgo, limit))
    else:
        cursor.execute("SELECT * FROM puxadas ORDER BY id DESC LIMIT ?", (limit,))
    puxadas = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return puxadas

def delete_puxada(puxada_id: int):
    """Exclui uma consulta específica do histórico de puxadas."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM puxadas WHERE id = ?", (puxada_id,))
    conn.commit()
    conn.close()
    return True

def clear_all_puxadas():
    """Limpa todo o histórico de consultas/puxadas mantendo os cadastros de leads."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM puxadas")
    cursor.execute("UPDATE leads SET total_queries = 0")
    conn.commit()
    conn.close()
    return True

def get_filter_stats():
    conn = get_connection()
    cursor = conn.cursor()

    # Top Estados Reais
    cursor.execute("""
        SELECT uf, COUNT(*) as count 
        FROM puxadas 
        WHERE uf IS NOT NULL AND TRIM(uf) != ''
        GROUP BY uf 
        ORDER BY count DESC 
        LIMIT 8
    """)
    top_ufs = [dict(r) for r in cursor.fetchall()]

    # Top Categorias Reais
    cursor.execute("""
        SELECT categoria, COUNT(*) as count 
        FROM puxadas 
        WHERE categoria IS NOT NULL AND TRIM(categoria) != ''
        GROUP BY categoria 
        ORDER BY count DESC 
        LIMIT 8
    """)
    top_categories = [dict(r) for r in cursor.fetchall()]

    # Top Termos Pesquisados
    cursor.execute("""
        SELECT termo, COUNT(*) as count 
        FROM puxadas 
        WHERE termo IS NOT NULL AND termo != '' 
        GROUP BY termo 
        ORDER BY count DESC 
        LIMIT 10
    """)
    top_terms = [dict(r) for r in cursor.fetchall()]

    # Totais gerais
    cursor.execute("SELECT COUNT(*) as total_searches, AVG(preco_medio) as global_avg_price FROM puxadas WHERE tipo = 'busca'")
    gen_stats = dict(cursor.fetchone() or {"total_searches": 0, "global_avg_price": 0})

    cursor.execute("SELECT COUNT(*) as total_validations, AVG(risk_score) as avg_risk FROM puxadas WHERE tipo = 'validacao'")
    val_stats = dict(cursor.fetchone() or {"total_validations": 0, "avg_risk": 0})

    conn.close()
    return {
        "top_ufs": top_ufs,
        "top_categories": top_categories,
        "top_terms": top_terms,
        "total_searches": gen_stats.get("total_searches", 0) or 0,
        "global_avg_price": round(gen_stats.get("global_avg_price", 0) or 0, 2),
        "total_validations": val_stats.get("total_validations", 0) or 0,
        "avg_risk": round(val_stats.get("avg_risk", 0) or 0, 1)
    }

def is_ip_blocked(ip: str) -> bool:
    if not ip or ip in ["127.0.0.1", "localhost", "::1"]:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM blocked_ips WHERE ip = ?", (ip,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

def block_ip(ip: str, reason: str = "Ataque ou atividade suspeita"):
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    cursor.execute("INSERT OR REPLACE INTO blocked_ips (ip, reason, blocked_at) VALUES (?, ?, ?)", (ip, reason, now_str))
    conn.commit()
    conn.close()

def unblock_ip(ip: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM blocked_ips WHERE ip = ?", (ip,))
    conn.commit()
    conn.close()

def list_blocked_ips():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM blocked_ips ORDER BY id DESC")
    ips = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return ips

def log_system_event(event_type: str, detail: str, ip: str = ""):
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    cursor.execute("INSERT INTO system_logs (event_type, detail, ip, timestamp) VALUES (?, ?, ?, ?)", (event_type, detail, ip, now_str))
    conn.commit()
    conn.close()

def get_admin_metrics():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as c FROM leads")
    total_leads = cursor.fetchone()["c"]

    cursor.execute("SELECT COUNT(*) as c FROM leads WHERE status = 'blocked'")
    blocked_leads = cursor.fetchone()["c"]

    cursor.execute("SELECT COUNT(*) as c FROM puxadas")
    total_puxadas = cursor.fetchone()["c"]

    cursor.execute("SELECT COUNT(*) as c FROM blocked_ips")
    total_blocked_ips = cursor.fetchone()["c"]

    cursor.execute("SELECT * FROM system_logs ORDER BY id DESC LIMIT 30")
    recent_logs = [dict(r) for r in cursor.fetchall()]

    # Contagem de leads online em tempo real
    now = datetime.datetime.now()
    cursor.execute("SELECT last_login FROM leads WHERE status = 'active'")
    active_leads_rows = cursor.fetchall()
    online_count = 0
    for r in active_leads_rows:
        ll = r["last_login"]
        if ll:
            try:
                dt = datetime.datetime.strptime(ll, "%d/%m/%Y %H:%M:%S")
                if 0 <= (now - dt).total_seconds() <= 600:
                    online_count += 1
            except Exception:
                pass

    conn.close()
    return {
        "total_leads": total_leads,
        "online_leads": online_count,
        "blocked_leads": blocked_leads,
        "total_puxadas": total_puxadas,
        "total_blocked_ips": total_blocked_ips,
        "recent_logs": recent_logs
    }

# ==========================================================
# CONFIGURAÇÕES GLOBAIS DO SISTEMA (MOTORES PRINCIPAL E SECUNDÁRIO)
# ==========================================================
def get_system_settings() -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM system_settings")
    settings = {r["key"]: r["value"] for r in cursor.fetchall()}
    conn.close()
    return settings

def update_system_setting(key: str, value: str):
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    cursor.execute("""
    INSERT INTO system_settings (key, value, updated_at) 
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, (key, value, now_str))
    conn.commit()
    conn.close()

# ==========================================================
# POOL DE TOKENS DE API & AUTO-ROTAÇÃO SUPREMA
# ==========================================================
def list_api_tokens(service: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if service:
        cursor.execute("SELECT * FROM api_tokens WHERE service = ? ORDER BY priority ASC, id ASC", (service,))
    else:
        cursor.execute("SELECT * FROM api_tokens ORDER BY priority ASC, id ASC")
    tokens = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return tokens

def add_api_token(token_str: str, service: str = "scraperapi", role: str = "primary", priority: int = 1):
    token_str = token_str.strip()
    if not token_str:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    try:
        cursor.execute("""
        INSERT INTO api_tokens (token, service, role, priority, is_active, status, requests_count, created_at)
        VALUES (?, ?, ?, ?, 1, 'ready', 0, ?)
        """, (token_str, service, role, priority, now_str))
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    finally:
        conn.close()
    return success

def add_api_tokens_bulk(tokens_list: list, service: str = "scraperapi", role: str = "primary", priority: int = 1):
    """Insere múltiplos tokens validados no pool automático, ignorando duplicados."""
    added_count = 0
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    for raw_tok in tokens_list:
        tok = str(raw_tok).strip()
        if not tok or len(tok) < 8:
            continue
        try:
            cursor.execute("""
            INSERT INTO api_tokens (token, service, role, priority, is_active, status, requests_count, created_at)
            VALUES (?, ?, ?, ?, 1, 'ready', 0, ?)
            """, (tok, service, role, priority, now_str))
            conn.commit()
            added_count += 1
        except sqlite3.IntegrityError:
            # Token já existe no banco, apenas ignora
            pass

    conn.close()
    return added_count

def set_token_role_and_priority(token_id: int, role: str, priority: int = 1):
    """Define se uma API/Token é Principal (role='primary') ou Secundária (role='secondary')."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE api_tokens 
    SET role = ?, priority = ?
    WHERE id = ?
    """, (role, priority, token_id))
    conn.commit()
    conn.close()

def update_token_credits(token_str: str, remaining: int, total: int = -1, status: str = "ready", details: str = ""):
    """Atualiza saldo de créditos, status e detalhes profundos do token."""
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    cursor.execute("""
    UPDATE api_tokens
    SET remaining_credits = ?, total_credits = ?, status = ?, last_checked_at = ?, details = ?
    WHERE token = ?
    """, (remaining, total, status, now_str, details, token_str))
    conn.commit()
    conn.close()

def delete_api_token(token_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM api_tokens WHERE id = ?", (token_id,))
    conn.commit()
    conn.close()

def toggle_api_token(token_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_active FROM api_tokens WHERE id = ?", (token_id,))
    row = cursor.fetchone()
    if row:
        new_val = 0 if row["is_active"] == 1 else 1
        cursor.execute("UPDATE api_tokens SET is_active = ?, status = 'ready' WHERE id = ?", (new_val, token_id))
        conn.commit()
    conn.close()

def get_next_available_token(service: str = "scraperapi", role: str = None, exclude_tokens: list = None) -> Optional[str]:
    """
    Seleção Inteligente Multicamada de Token:
    1. Se role for explicitamente informada ('primary' ou 'secondary'), busca respeitando a categoria.
    2. Se role for None ou se o lote 'primary' estiver zerado/esgotado, busca automaticamente do lote 'secondary' (fallover inteligente).
    3. Ordena por prioridade ascendente, créditos disponíveis decrescente e menor contagem de erros.
    """
    conn = get_connection()
    cursor = conn.cursor()
    exclude_tokens = exclude_tokens or []
    
    placeholders = ",".join("?" for _ in exclude_tokens) if exclude_tokens else "''"
    
    # 1ª Tentativa: busca respeitando a role ou priorizando 'primary'
    target_role = role or "primary"
    query_primary = f"""
    SELECT token FROM api_tokens 
    WHERE service = ? AND role = ? AND is_active = 1 AND status != 'exhausted' 
      AND (remaining_credits > 0 OR remaining_credits = -1)
      AND token NOT IN ({placeholders})
    ORDER BY 
      priority ASC,
      CASE WHEN remaining_credits > 0 THEN 0 ELSE 1 END ASC,
      remaining_credits DESC,
      errors_count ASC,
      requests_count ASC, 
      id ASC
    LIMIT 1
    """
    params = [service, target_role]
    if exclude_tokens:
        params.extend(exclude_tokens)

    cursor.execute(query_primary, params)
    row = cursor.fetchone()
    
    # 2ª Tentativa (Fallover inteligente): Se não especificou role rígida e esgotou primary, busca no secundário
    if not row and role is None:
        query_fallback = f"""
        SELECT token FROM api_tokens 
        WHERE service = ? AND role = 'secondary' AND is_active = 1 AND status != 'exhausted' 
          AND (remaining_credits > 0 OR remaining_credits = -1)
          AND token NOT IN ({placeholders})
        ORDER BY 
          priority ASC,
          CASE WHEN remaining_credits > 0 THEN 0 ELSE 1 END ASC,
          remaining_credits DESC,
          errors_count ASC,
          requests_count ASC, 
          id ASC
        LIMIT 1
        """
        params_fb = [service]
        if exclude_tokens:
            params_fb.extend(exclude_tokens)
        cursor.execute(query_fallback, params_fb)
        row = cursor.fetchone()

    conn.close()
    
    if row:
        return row["token"]
        
    return None

def record_token_request(token_str: str, success: bool = True):
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    if success:
        cursor.execute("""
        UPDATE api_tokens 
        SET requests_count = requests_count + 1, last_used_at = ?, status = 'ready'
        WHERE token = ?
        """, (now_str, token_str))
    else:
        cursor.execute("""
        UPDATE api_tokens 
        SET errors_count = errors_count + 1, last_used_at = ?
        WHERE token = ?
        """, (now_str, token_str))
    conn.commit()
    conn.close()

def mark_token_exhausted(token_str: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE api_tokens SET status = 'exhausted' WHERE token = ?", (token_str,))
    conn.commit()
    conn.close()

def reset_system_all_data() -> dict:
    """
    Restauração e Higienização Total do Sistema:
    - Purga todo o histórico de puxadas, buscas e filtros de teste
    - Zera contadores de consultas de leads
    - Limpa logs de eventos e atividades anteriores
    - Otimiza e executa VACUUM no banco de dados SQLite
    - Retorna resumo das contagens purgadas
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as c FROM puxadas")
        purged_puxadas = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM system_logs")
        purged_logs = cursor.fetchone()["c"]

        # 1. Limpa tabela de puxadas (buscas, validações, métricas acumuladas)
        cursor.execute("DELETE FROM puxadas")

        # 2. Limpa tabela de logs do sistema
        cursor.execute("DELETE FROM system_logs")

        # 3. Zera contadores de consultas de todos os leads mantendo apenas contas ativas
        cursor.execute("UPDATE leads SET total_queries = 0")

        # 4. Remove leads anônimos / temporários de teste e mocks, preservando apenas admin supremo se houver
        cursor.execute("DELETE FROM leads WHERE role != 'admin' OR vulgo LIKE '%An%nimo%' OR vulgo = 'Anônimo' OR vulgo = 'SombraCyber' OR vulgo = 'NG7k'")

        conn.commit()

        # 5. Executa VACUUM para liberar espaço e reindexar
        cursor.execute("VACUUM")
        conn.commit()

        # 6. Registra novo log oficial de restauração suprema
        now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        cursor.execute("""
        INSERT INTO system_logs (event_type, detail, ip, timestamp)
        VALUES ('SYSTEM_PURGE_SUCCESS', 'Sistema totalmente restaurado e purgado pelo Admin Supremo. Base limpa para produção.', '127.0.0.1', ?)
        """, (now_str,))
        conn.commit()

        return {
            "success": True,
            "purged_puxadas": purged_puxadas,
            "purged_logs": purged_logs,
            "message": "Sistema totalmente restaurado e higienizado com sucesso!"
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

