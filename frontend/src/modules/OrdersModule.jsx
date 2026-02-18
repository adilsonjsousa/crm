import { useEffect, useState } from "react";
import { createOrder, listCompanyOptions, listOrders } from "../lib/revenueApi";
import { OPPORTUNITY_PRODUCTS, OPPORTUNITY_TITLES, resolveEstimatedValueByProduct } from "../lib/productCatalog";

const ORDER_TYPES = [
  { value: "equipment", label: "Equipamento" },
  { value: "supplies", label: "Suprimentos" },
  { value: "service", label: "Serviço" }
];

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export default function OrdersModule() {
  const [orders, setOrders] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_id: "",
    order_number: "",
    order_type: "equipment",
    status: "pending",
    title_category: "",
    title_product: "",
    total_amount: "",
    order_date: ""
  });

  async function load() {
    setError("");
    try {
      const [orderData, companyData] = await Promise.all([listOrders(), listCompanyOptions()]);
      setOrders(orderData);
      setCompanies(companyData);
      if (!form.company_id && companyData.length) {
        setForm((prev) => ({ ...prev, company_id: companyData[0].id }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      if (!String(form.title_category || "").trim()) {
        setError("Selecione o título da oportunidade.");
        return;
      }
      if (!String(form.title_product || "").trim()) {
        setError("Selecione o produto.");
        return;
      }

      const fallbackPrice = resolveEstimatedValueByProduct(form.title_category, form.title_product);
      const totalAmount = Number(form.total_amount || fallbackPrice || 0);
      const itemDescription = `${form.title_category} > ${form.title_product}`;

      await createOrder({
        company_id: form.company_id,
        order_number: form.order_number,
        order_type: form.order_type,
        status: form.status,
        total_amount: totalAmount,
        order_date: form.order_date || new Date().toISOString().slice(0, 10),
        items: [
          {
            item_description: itemDescription,
            quantity: 1,
            unit_price: totalAmount
          }
        ]
      });

      setForm((prev) => ({
        ...prev,
        order_number: "",
        title_category: "",
        title_product: "",
        total_amount: "",
        order_date: ""
      }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Pedidos de Venda</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <select
            required
            value={form.company_id}
            onChange={(e) => setForm((prev) => ({ ...prev, company_id: e.target.value }))}
          >
            <option value="">Selecione a empresa</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.trade_name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Número do pedido"
            value={form.order_number}
            onChange={(e) => setForm((prev) => ({ ...prev, order_number: e.target.value }))}
          />
          <select value={form.order_type} onChange={(e) => setForm((prev) => ({ ...prev, order_type: e.target.value }))}>
            {ORDER_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <select
            required
            value={form.title_category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, title_category: e.target.value, title_product: "", total_amount: "" }))
            }
          >
            <option value="">Título da oportunidade</option>
            {OPPORTUNITY_TITLES.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
          <input
            required
            list="orders-product-options"
            placeholder="Produto"
            value={form.title_product}
            onChange={(e) =>
              setForm((prev) => {
                const nextProduct = e.target.value;
                const mappedPrice = resolveEstimatedValueByProduct(prev.title_category, nextProduct);
                return {
                  ...prev,
                  title_product: nextProduct,
                  total_amount: mappedPrice === null ? prev.total_amount : String(mappedPrice)
                };
              })
            }
            disabled={!form.title_category}
          />
          <datalist id="orders-product-options">
            {(OPPORTUNITY_PRODUCTS[form.title_category] || []).map((product) => (
              <option key={product} value={product} />
            ))}
          </datalist>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="Valor total"
            value={form.total_amount}
            onChange={(e) => setForm((prev) => ({ ...prev, total_amount: e.target.value }))}
          />
          <input
            type="date"
            value={form.order_date}
            onChange={(e) => setForm((prev) => ({ ...prev, order_date: e.target.value }))}
          />
          <button type="submit" className="btn-primary">Salvar pedido</button>
        </form>
      </article>

      <article className="panel">
        <h3>Pedidos recentes</h3>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Produtos</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.order_number}</td>
                  <td>{order.companies?.trade_name || "-"}</td>
                  <td>{order.order_type}</td>
                  <td>{(order.items || []).map((item) => item.item_description).join(", ") || "-"}</td>
                  <td>{brl(order.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
