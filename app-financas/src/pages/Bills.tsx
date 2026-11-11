import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { useBills, useRegistry, useToday } from "../data/hooks";
import { RECURRENCE_LABEL, endCompetence } from "../domain/bills";
import { competenceOf, formatCompetenceShort } from "../domain/dates";
import { paymentLabel } from "../domain/registry";
import { useMoney } from "../data/privacy";

export default function Bills() {
  const money = useMoney();
  const uid = useAuth().user!.uid;
  const bills = useBills(uid);
  const registry = useRegistry(uid).data;
  const thisMonth = competenceOf(useToday());
  const sorted = [...bills.data].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <main className="page">
      <header className="page-head">
        <h1>Contas recorrentes</h1>
        <Link className="btn primary small" to="/contas/nova">
          Nova conta
        </Link>
      </header>

      {bills.error && (
        <p className="error" role="alert">
          Não foi possível carregar as contas.
        </p>
      )}

      {!bills.ready ? (
        <p className="muted center-text">Carregando…</p>
      ) : sorted.length === 0 ? (
        <div className="empty card">
          <h2>Nenhuma conta cadastrada</h2>
          <p className="muted">
            Toque em “Nova conta” para começar. Dica: comece pelas que mais
            vencem no mesmo dia.
          </p>
          <p className="muted">
            Já tem uma planilha?{" "}
            <Link to="/cadastros/planilhas">Importe um CSV</Link>.
          </p>
        </div>
      ) : (
        <ul className="list">
          {sorted.map((b) => {
            const last = b.installmentCount
              ? endCompetence(b.startMonth, b.recurrence, b.installmentCount)
              : null;
            return (
              <li
                key={b.id}
                className={b.active ? "row-card" : "row-card archived"}
              >
                <Link className="row-main" to={`/contas/${b.id}`}>
                  <span className="row-title">{b.name}</span>
                  <span className="muted">
                    Dia {b.dueDay} · {RECURRENCE_LABEL[b.recurrence]} ·{" "}
                    {paymentLabel(registry, b.paymentMethod)}
                  </span>
                  {last && (
                    <span className="muted">
                      {b.installmentCount}{" "}
                      {b.installmentCount === 1 ? "parcela" : "parcelas"}, até{" "}
                      {formatCompetenceShort(last)}
                    </span>
                  )}
                  {!b.active && (
                    <span className="chip chip-prevista">Arquivada</span>
                  )}
                  {b.active && last && last < thisMonth && (
                    <span className="chip chip-prevista">Encerrada</span>
                  )}
                </Link>
                <div className="row-side">
                  <strong>{money(b.expectedAmountCents)}</strong>
                  <span className="muted">
                    {b.valueType === "fixed" ? "fixo" : "estimado"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
