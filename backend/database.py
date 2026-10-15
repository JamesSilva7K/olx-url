import sqlite3
import datetime
import os
from .config import DB_PATH

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

    # Tabela de Pool de Chaves / Tokens de API (Auto-Rotação & Quota Fallover)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        service TEXT DEFAULT 'scraperapi',
        is_active INTEGER DEFAULT 1,
        status TEXT DEFAULT 'ready',
        requests_count INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_used_at TEXT
    );
    """)

    # Seed inicial com a chave padrão se a tabela estiver vazia
    cursor.execute("SELECT COUNT(*) as c FROM api_tokens")
    if cursor.fetchone()["c"] == 0:
        now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        cursor.execute("""
        INSERT INTO api_tokens (token, service, is_active, status, requests_count, created_at)
        VALUES (?, 'scraperapi', 1, 'ready', 0, ?)
        """, ("1aec3392b82784e4578154b96887e010", now_str))

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
        """, (vulgo, avatar or "avatar1", now_str, now_str, ip, user_agent))
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
    leads = [dict(r) for r in cursor.fetchall()]
    conn.close()
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

def get_filter_stats():
    conn = get_connection()
    cursor = conn.cursor()

    # Top Estados
    cursor.execute("""
        SELECT uf, COUNT(*) as count 
        FROM puxadas 
        WHERE uf IS NOT NULL AND uf != '' 
        GROUP BY uf 
        ORDER BY count DESC 
        LIMIT 8
    """)
    top_ufs = [dict(r) for r in cursor.fetchall()]

    # Top Categorias
    cursor.execute("""
        SELECT categoria, COUNT(*) as count 
        FROM puxadas 
        WHERE categoria IS NOT NULL AND categoria != '' 
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

    cursor.execute("SELECT * FROM system_logs ORDER BY id DESC LIMIT 20")
    recent_logs = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "total_leads": total_leads,
        "blocked_leads": blocked_leads,
        "total_puxadas": total_puxadas,
        "total_blocked_ips": total_blocked_ips,
        "recent_logs": recent_logs
    }

# ==========================================================
# POOL DE TOKENS DE API & AUTO-ROTAÇÃO SUPREMA
# ==========================================================
def list_api_tokens(service: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if service:
        cursor.execute("SELECT * FROM api_tokens WHERE service = ? ORDER BY id ASC", (service,))
    else:
        cursor.execute("SELECT * FROM api_tokens ORDER BY id ASC")
    tokens = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return tokens

def add_api_token(token_str: str, service: str = "scraperapi"):
    token_str = token_str.strip()
    if not token_str:
        return False
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    try:
        cursor.execute("""
        INSERT INTO api_tokens (token, service, is_active, status, requests_count, created_at)
        VALUES (?, ?, 1, 'ready', 0, ?)
        """, (token_str, service, now_str))
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    finally:
        conn.close()
    return success

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

def get_next_available_token(service: str = "scraperapi", exclude_tokens: list = None) -> str:
    conn = get_connection()
    cursor = conn.cursor()
    exclude_tokens = exclude_tokens or []
    
    placeholders = ",".join("?" for _ in exclude_tokens) if exclude_tokens else "''"
    query = f"""
    SELECT token FROM api_tokens 
    WHERE service = ? AND is_active = 1 AND status != 'exhausted' 
      AND token NOT IN ({placeholders})
    ORDER BY requests_count ASC, id ASC
    LIMIT 1
    """
    params = [service] + exclude_tokens if exclude_tokens else [service]
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return row["token"]
        
    # Se todos estiverem marcados como 'exhausted', faz auto-reset suave do pool
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE api_tokens SET status = 'ready' WHERE service = ? AND is_active = 1", (service,))
    conn.commit()
    cursor.execute("SELECT token FROM api_tokens WHERE service = ? AND is_active = 1 ORDER BY requests_count ASC LIMIT 1", (service,))
    row_reset = cursor.fetchone()
    conn.close()
    
    return row_reset["token"] if row_reset else "1aec3392b82784e4578154b96887e010"

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

