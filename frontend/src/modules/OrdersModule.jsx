import { useEffect, useState } from "react";
import { createOrder, deleteOrder, listCompanyOptions, listOrders } from "../lib/revenueApi";
import { confirmStrongDelete } from "../lib/confirmDelete";
import {
  PRODUCTS_BY_SUBCATEGORY,
  SALES_TYPES,
  getSubcategoriesByType,
  resolveEstimatedValueByProduct
} from "../lib/productCatalog";

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function orderTypeLabel(value) {
  return SALES_TYPES.find((item) => item.value === value)?.label || value;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export default function OrdersModule() {
  const [orders, setOrders] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [form, setForm] = useState({
    company_id: "",
    order_number: "",
    order_type: "equipment",
    status: "pending",
    title_subcategory: "",
    title_product: "",
    total_amount: "",
    order_date: todayYmd()
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
    setSuccess("");

    try {
      if (!String(form.order_type || "").trim()) {
        setError("Selecione o tipo.");
        return;
      }
      if (!String(form.title_subcategory || "").trim()) {
        setError("Selecione a sub-categoria.");
        return;
      }
      if (!String(form.title_product || "").trim()) {
        setError("Selecione o produto.");
        return;
      }

      const fallbackPrice = resolveEstimatedValueByProduct(form.title_subcategory, form.title_product);
      const totalAmount = Number(form.total_amount || fallbackPrice || 0);
      const itemDescription = `${form.title_subcategory} > ${form.title_product}`;

      await createOrder({
        company_id: form.company_id,
        order_number: form.order_number,
        order_type: form.order_type,
        status: form.status,
        total_amount: totalAmount,
        order_date: form.order_date || todayYmd(),
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
        title_subcategory: "",
        title_product: "",
        total_amount: "",
        order_date: todayYmd()
      }));
      await load();
      setSuccess("Pedido salvo com sucesso.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteOrder(order) {
    const orderId = String(order?.id || "").trim();
    if (!orderId) return;

    const confirmed = await confirmStrongDelete({
      entityLabel: "o pedido",
      itemLabel: order?.order_number || orderId
    });
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingOrderId(orderId);
    try {
      await deleteOrder(orderId);
      setOrders((prev) => prev.filter((item) => item.id !== orderId));
      setSuccess("Pedido excluído com sucesso.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingOrderId("");
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Pedidos de Venda</h2>
        {success ? <p className="success-text">{success}</p> : null}
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
          <select
            value={form.order_type}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                order_type: e.target.value,
                title_subcategory: "",
                title_product: "",
                total_amount: ""
              }))
            }
          >
            {SALES_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <input
            required
            list="orders-subcategory-options"
            placeholder="Sub-categoria"
            value={form.title_subcategory}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, title_subcategory: e.target.value, title_product: "", total_amount: "" }))
            }
          />
          <datalist id="orders-subcategory-options">
            {getSubcategoriesByType(form.order_type).map((subcategory) => (
              <option key={subcategory} value={subcategory} />
            ))}
          </datalist>
          <input
            required
            list="orders-product-options"
            placeholder="Produto"
            value={form.title_product}
            onChange={(e) =>
              setForm((prev) => {
                const nextProduct = e.target.value;
                const mappedPrice = resolveEstimatedValueByProduct(prev.title_subcategory, nextProduct);
                return {
                  ...prev,
                  title_product: nextProduct,
                  total_amount: mappedPrice === null ? prev.total_amount : String(mappedPrice)
                };
              })
            }
            disabled={!form.title_subcategory}
          />
          <datalist id="orders-product-options">
            {(PRODUCTS_BY_SUBCATEGORY[form.title_subcategory] || []).map((product) => (
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
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.order_number}</td>
                  <td>{order.companies?.trade_name || "-"}</td>
                  <td>{orderTypeLabel(order.order_type)}</td>
                  <td>{(order.items || []).map((item) => item.item_description).join(", ") || "-"}</td>
                  <td>{brl(order.total_amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-table-action"
                      onClick={() => handleDeleteOrder(order)}
                      disabled={deletingOrderId === order.id}
                    >
                      {deletingOrderId === order.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
