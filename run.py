import sys
import io
import uvicorn

# Força codificação UTF-8 no stdout/stderr do Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

if __name__ == "__main__":
    print("=" * 60)
    print(">> OLX BRASIL - CONSULTADOR, VALIDADOR & PAINEL SUPREMO")
    print(">> BLINDAGEM ATIVA: Anti-DDoS, Camuflagem de Headers, Anti-Copia")
    print(">> Servidor rodando em: http://127.0.0.1:8000")
    print(">> Chave de Acesso Admin Supremo: SUPREMO_OLX_2026")
    print("=" * 60)
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
