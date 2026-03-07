// ============================================================
// Minhas Finanças Pessoais - App Principal
// Dados salvos no localStorage do navegador
// ============================================================

(function () {
  'use strict';

  // ===== Constantes =====
  const STORAGE_KEY = 'financas_pessoais_data';
  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const CATEGORIAS = {
    moradia:        { emoji: '🏠', nome: 'Moradia',          cor: '#e17055' },
    alimentacao:    { emoji: '🍔', nome: 'Alimentação',      cor: '#fdcb6e' },
    transporte:     { emoji: '🚗', nome: 'Transporte',       cor: '#74b9ff' },
    saude:          { emoji: '💊', nome: 'Saúde',            cor: '#ff7675' },
    educacao:       { emoji: '📚', nome: 'Educação',         cor: '#a29bfe' },
    lazer:          { emoji: '🎮', nome: 'Lazer',            cor: '#55efc4' },
    vestuario:      { emoji: '👕', nome: 'Vestuário',        cor: '#fab1a0' },
    servicos:       { emoji: '📱', nome: 'Serviços',         cor: '#81ecec' },
    impostos:       { emoji: '📋', nome: 'Impostos/Taxas',   cor: '#dfe6e9' },
    outros_despesa: { emoji: '📦', nome: 'Outros',           cor: '#b2bec3' },
    salario:        { emoji: '💰', nome: 'Salário',          cor: '#00b894' },
    freelance:      { emoji: '💻', nome: 'Freelance',        cor: '#00cec9' },
    investimentos:  { emoji: '📈', nome: 'Investimentos',    cor: '#6c5ce7' },
    outros_receita: { emoji: '💵', nome: 'Outros',           cor: '#0984e3' },
  };

  // ===== State =====
  let transacoes = [];
  let mesAtual = new Date().getMonth();
  let anoAtual = new Date().getFullYear();
  let sortColumn = 'vencimento';
  let sortDir = 'asc';
  let chartCategorias = null;
  let chartMensal = null;
  let chartSaldo = null;
  let subTabAtiva = 'todos';

  // ===== DOM refs =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
    bindEvents();
    setDefaultDate();
    populateFiltroCategoria();
    atualizarTudo();
  });

  // ===== Persistence =====
  function carregarDados() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      transacoes = raw ? JSON.parse(raw) : [];
    } catch {
      transacoes = [];
    }
  }

  function salvarDados() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transacoes));
  }

  // ===== Events =====
  function bindEvents() {
    $('#formTransacao').addEventListener('submit', handleSubmit);
    $('#btnCancelar').addEventListener('click', cancelarEdicao);
    $('#btnMesAnterior').addEventListener('click', () => mudarMes(-1));
    $('#btnProximoMes').addEventListener('click', () => mudarMes(1));
    $('#btnExportarCSV').addEventListener('click', exportarCSV);

    // Filters
    $('#filtroTipo').addEventListener('change', atualizarTudo);
    $('#filtroCategoria').addEventListener('change', atualizarTudo);
    $('#filtroStatus').addEventListener('change', atualizarTudo);
    $('#filtroBusca').addEventListener('input', atualizarTudo);

    // Tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        const tabId = tab.dataset.tab;
        $(`#tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.add('active');
        if (tabId === 'graficos') renderGraficos();
        if (tabId === 'calendario') renderCalendario();
      });
    });

    // Sort
    $$('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDir = 'asc';
        }
        atualizarTudo();
      });
    });

    // Modal
    $('#modalCancelBtn').addEventListener('click', fecharModal);

    // Toggle meses recorrência
    $('#recorrente').addEventListener('change', () => {
      $('#rowMesesRecorrencia').style.display = $('#recorrente').value === 'mensal' ? '' : 'none';
    });

    // Sub-tabs (Todas | Despesas | Receitas)
    $$('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        subTabAtiva = btn.dataset.subtab;
        atualizarTudo();
      });
    });
  }

  function setDefaultDate() {
    const today = new Date();
    $('#vencimento').value = today.toISOString().split('T')[0];
  }

  function populateFiltroCategoria() {
    const select = $('#filtroCategoria');
    select.innerHTML = '<option value="todos">Todas</option>';
    for (const [key, val] of Object.entries(CATEGORIAS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${val.emoji} ${val.nome}`;
      select.appendChild(opt);
    }
  }

  // ===== Month Navigation =====
  function mudarMes(delta) {
    mesAtual += delta;
    if (mesAtual > 11) { mesAtual = 0; anoAtual++; }
    if (mesAtual < 0) { mesAtual = 11; anoAtual--; }
    atualizarTudo();
  }

  // ===== CRUD =====
  function handleSubmit(e) {
    e.preventDefault();
    const id = $('#editandoId').value;
    const dados = {
      id: id || gerarId(),
      descricao: $('#descricao').value.trim(),
      valor: parseFloat($('#valor').value),
      tipo: $('#tipo').value,
      categoria: $('#categoria').value,
      vencimento: $('#vencimento').value,
      status: $('#status').value,
      recorrente: $('#recorrente').value,
      mesesRecorrencia: $('#recorrente').value === 'mensal' ? parseInt($('#mesesRecorrencia').value) || 12 : 0,
      observacao: $('#observacao').value.trim(),
    };

    if (id) {
      const idx = transacoes.findIndex(t => t.id === id);
      if (idx !== -1) transacoes[idx] = dados;
      toast('Transação atualizada!', 'success');
    } else {
      transacoes.push(dados);
      // Se for recorrente mensal, criar para os próximos N-1 meses
      if (dados.recorrente === 'mensal' && dados.mesesRecorrencia > 1) {
        criarRecorrencias(dados);
      }
      toast('Transação adicionada!', 'success');
    }

    salvarDados();
    resetForm();
    atualizarTudo();
  }

  function criarRecorrencias(base) {
    const totalMeses = Math.min(Math.max(base.mesesRecorrencia || 12, 1), 60);
    const dataBase = new Date(base.vencimento + 'T12:00:00');
    for (let i = 1; i < totalMeses; i++) {
      const novaData = new Date(dataBase);
      novaData.setMonth(novaData.getMonth() + i);
      transacoes.push({
        ...base,
        id: gerarId(),
        vencimento: novaData.toISOString().split('T')[0],
        status: 'pendente',
      });
    }
  }

  function editarTransacao(id) {
    const t = transacoes.find(tr => tr.id === id);
    if (!t) return;

    $('#descricao').value = t.descricao;
    $('#valor').value = t.valor;
    $('#tipo').value = t.tipo;
    $('#categoria').value = t.categoria;
    $('#vencimento').value = t.vencimento;
    $('#status').value = t.status;
    $('#recorrente').value = t.recorrente || 'nao';
    $('#mesesRecorrencia').value = t.mesesRecorrencia || 12;
    $('#rowMesesRecorrencia').style.display = (t.recorrente === 'mensal') ? '' : 'none';
    $('#observacao').value = t.observacao || '';
    $('#editandoId').value = t.id;

    $('#btnSalvar').innerHTML = '<i class="fas fa-check"></i> Atualizar';
    $('#btnCancelar').style.display = '';

    // Scroll to form
    $('#formTransacao').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function excluirTransacao(id) {
    const t = transacoes.find(tr => tr.id === id);
    if (!t) return;

    abrirModal(
      'Excluir Transação',
      `Deseja excluir "${t.descricao}" (R$ ${t.valor.toFixed(2)})?`,
      () => {
        transacoes = transacoes.filter(tr => tr.id !== id);
        salvarDados();
        atualizarTudo();
        toast('Transação excluída!', 'info');
        fecharModal();
      }
    );
  }

  function marcarPago(id) {
    const t = transacoes.find(tr => tr.id === id);
    if (!t) return;
    t.status = t.status === 'pago' ? 'pendente' : 'pago';
    salvarDados();
    atualizarTudo();
    toast(t.status === 'pago' ? 'Marcado como pago!' : 'Marcado como pendente!', 'success');
  }

  function cancelarEdicao() {
    resetForm();
  }

  function resetForm() {
    $('#formTransacao').reset();
    $('#editandoId').value = '';
    $('#btnSalvar').innerHTML = '<i class="fas fa-save"></i> Salvar';
    $('#btnCancelar').style.display = 'none';
    $('#rowMesesRecorrencia').style.display = 'none';
    setDefaultDate();
  }

  // ===== Filtering & Sorting =====
  function getTransacoesFiltradas() {
    const filtroTipo = $('#filtroTipo').value;
    const filtroCat = $('#filtroCategoria').value;
    const filtroSt = $('#filtroStatus').value;
    const busca = $('#filtroBusca').value.toLowerCase();
    const hoje = new Date().toISOString().split('T')[0];

    return transacoes
      .filter(t => {
        const [ano, mes] = t.vencimento.split('-').map(Number);
        if (ano !== anoAtual || mes - 1 !== mesAtual) return false;
        // Sub-tab filter takes priority
        if (subTabAtiva !== 'todos' && t.tipo !== subTabAtiva) return false;
        if (subTabAtiva === 'todos' && filtroTipo !== 'todos' && t.tipo !== filtroTipo) return false;
        if (filtroCat !== 'todos' && t.categoria !== filtroCat) return false;
        if (filtroSt === 'vencido') {
          if (t.status === 'pago' || t.vencimento >= hoje) return false;
        } else if (filtroSt !== 'todos' && t.status !== filtroSt) {
          return false;
        }
        if (busca && !t.descricao.toLowerCase().includes(busca)) return false;
        return true;
      })
      .sort((a, b) => {
        let va, vb;
        if (sortColumn === 'vencimento') {
          va = a.vencimento; vb = b.vencimento;
        } else if (sortColumn === 'valor') {
          va = a.valor; vb = b.valor;
        } else {
          va = a.descricao.toLowerCase(); vb = b.descricao.toLowerCase();
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
  }

  function getTransacoesMes(m, a) {
    return transacoes.filter(t => {
      const [ano, mes] = t.vencimento.split('-').map(Number);
      return ano === a && mes - 1 === m;
    });
  }

  // ===== Render All =====
  function atualizarTudo() {
    atualizarLabelMes();
    atualizarSummary();
    renderTabela();
    // Update charts if visible
    if ($('#tabGraficos').classList.contains('active')) renderGraficos();
    if ($('#tabCalendario').classList.contains('active')) renderCalendario();
  }

  function atualizarLabelMes() {
    $('#mesAtualLabel').textContent = `${MESES[mesAtual]} ${anoAtual}`;
  }

  function atualizarSummary() {
    const lista = getTransacoesMes(mesAtual, anoAtual);
    const hoje = new Date().toISOString().split('T')[0];

    let receitas = 0, despesas = 0, pendente = 0;
    lista.forEach(t => {
      if (t.tipo === 'receita') receitas += t.valor;
      else despesas += t.valor;
      if (t.status === 'pendente' && t.tipo === 'despesa') pendente += t.valor;
    });

    const saldo = receitas - despesas;

    $('#totalReceitas').textContent = formatMoney(receitas);
    $('#totalDespesas').textContent = formatMoney(despesas);
    $('#totalSaldo').textContent = formatMoney(saldo);
    $('#totalPendente').textContent = formatMoney(pendente);

    // Color saldo
    const saldoEl = $('#totalSaldo');
    saldoEl.style.color = saldo >= 0 ? 'var(--saldo-pos)' : 'var(--saldo-neg)';
  }

  // ===== Table Render =====
  function renderTabela() {
    const lista = getTransacoesFiltradas();
    const tbody = $('#listaTransacoes');
    const empty = $('#semResultados');
    const count = $('#resultCount');
    const hoje = new Date().toISOString().split('T')[0];

    count.textContent = `${lista.length} transaç${lista.length === 1 ? 'ão' : 'ões'}`;

    if (lista.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = lista.map(t => {
      const cat = CATEGORIAS[t.categoria] || { emoji: '?', nome: t.categoria, cor: '#636e72' };
      const isVencido = t.status === 'pendente' && t.vencimento < hoje;
      const statusClass = isVencido ? 'vencido' : t.status;
      const statusLabel = isVencido ? 'Vencido' : (t.status === 'pago' ? 'Pago' : 'Pendente');
      const valorClass = t.tipo === 'receita' ? 'valor-receita' : 'valor-despesa';
      const sinal = t.tipo === 'receita' ? '+' : '-';

      return `<tr>
        <td>${formatDate(t.vencimento)}</td>
        <td>
          <span class="desc-cell">${escapeHtml(t.descricao)}</span>
          ${t.recorrente === 'mensal' ? `<i class="fas fa-sync-alt recorrente-icon" title="Recorrente: ${t.mesesRecorrencia || 12} meses"></i>` : ''}
          ${t.observacao ? `<span class="obs-text">${escapeHtml(t.observacao)}</span>` : ''}
        </td>
        <td><span class="categoria-badge">${cat.emoji} ${cat.nome}</span></td>
        <td class="${valorClass}">${sinal} ${formatMoney(t.valor)}</td>
        <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
        <td>
          <div class="acoes-cell">
            <button class="btn-acao btn-check" onclick="window._app.marcarPago('${t.id}')" title="${t.status === 'pago' ? 'Marcar pendente' : 'Marcar pago'}">
              <i class="fas fa-${t.status === 'pago' ? 'undo' : 'check'}"></i>
            </button>
            <button class="btn-acao" onclick="window._app.editarTransacao('${t.id}')" title="Editar">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn-acao btn-delete" onclick="window._app.excluirTransacao('${t.id}')" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ===== Charts =====
  function renderGraficos() {
    renderChartCategorias();
    renderChartMensal();
    renderChartSaldo();
    renderTopDespesas();
  }

  function renderChartCategorias() {
    const lista = getTransacoesMes(mesAtual, anoAtual).filter(t => t.tipo === 'despesa');
    const porCat = {};
    lista.forEach(t => {
      if (!porCat[t.categoria]) porCat[t.categoria] = 0;
      porCat[t.categoria] += t.valor;
    });

    const labels = [];
    const data = [];
    const colors = [];

    for (const [key, val] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) {
      const cat = CATEGORIAS[key] || { emoji: '?', nome: key, cor: '#636e72' };
      labels.push(`${cat.emoji} ${cat.nome}`);
      data.push(val);
      colors.push(cat.cor);
    }

    if (chartCategorias) chartCategorias.destroy();

    const ctx = $('#chartCategorias').getContext('2d');
    chartCategorias = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatMoney(ctx.parsed)}`
            }
          }
        },
        cutout: '65%',
      }
    });

    // Legend
    const legendEl = $('#legendaCategorias');
    legendEl.innerHTML = labels.map((l, i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l}: ${formatMoney(data[i])}</span>`
    ).join('');
  }

  function renderChartMensal() {
    const meses = [];
    const receitas = [];
    const despesas = [];

    for (let i = 5; i >= 0; i--) {
      let m = mesAtual - i;
      let a = anoAtual;
      if (m < 0) { m += 12; a--; }
      const lista = getTransacoesMes(m, a);
      meses.push(`${MESES[m].substring(0, 3)}/${a}`);
      let r = 0, d = 0;
      lista.forEach(t => { if (t.tipo === 'receita') r += t.valor; else d += t.valor; });
      receitas.push(r);
      despesas.push(d);
    }

    if (chartMensal) chartMensal.destroy();

    const ctx = $('#chartMensal').getContext('2d');
    chartMensal = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [
          { label: 'Receitas', data: receitas, backgroundColor: 'rgba(0,184,148,0.7)', borderRadius: 6 },
          { label: 'Despesas', data: despesas, backgroundColor: 'rgba(255,107,107,0.7)', borderRadius: 6 },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#8b8fa3', font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: '#8b8fa3' }, grid: { display: false } },
          y: { ticks: { color: '#8b8fa3', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: 'rgba(45,49,72,0.5)' } }
        }
      }
    });
  }

  function renderChartSaldo() {
    const meses = [];
    const saldos = [];

    for (let i = 5; i >= 0; i--) {
      let m = mesAtual - i;
      let a = anoAtual;
      if (m < 0) { m += 12; a--; }
      const lista = getTransacoesMes(m, a);
      meses.push(`${MESES[m].substring(0, 3)}/${a}`);
      let saldo = 0;
      lista.forEach(t => { saldo += t.tipo === 'receita' ? t.valor : -t.valor; });
      saldos.push(saldo);
    }

    if (chartSaldo) chartSaldo.destroy();

    const ctx = $('#chartSaldo').getContext('2d');
    chartSaldo = new Chart(ctx, {
      type: 'line',
      data: {
        labels: meses,
        datasets: [{
          label: 'Saldo',
          data: saldos,
          borderColor: '#6c5ce7',
          backgroundColor: 'rgba(108,92,231,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#6c5ce7',
          pointRadius: 5,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` Saldo: ${formatMoney(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: '#8b8fa3' }, grid: { display: false } },
          y: { ticks: { color: '#8b8fa3', callback: v => formatMoney(v) }, grid: { color: 'rgba(45,49,72,0.5)' } }
        }
      }
    });
  }

  function renderTopDespesas() {
    const lista = getTransacoesMes(mesAtual, anoAtual)
      .filter(t => t.tipo === 'despesa')
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    const container = $('#topDespesas');

    if (lista.length === 0) {
      container.innerHTML = '<div class="top-empty">Nenhuma despesa neste mês</div>';
      return;
    }

    const maxVal = lista[0].valor;
    container.innerHTML = lista.map((t, i) => {
      const cat = CATEGORIAS[t.categoria] || { emoji: '?', nome: t.categoria };
      const pct = (t.valor / maxVal * 100).toFixed(0);
      return `<div class="top-item">
        <span class="top-rank">${i + 1}</span>
        <div class="top-info">
          <div class="top-desc">${escapeHtml(t.descricao)}</div>
          <div class="top-cat">${cat.emoji} ${cat.nome}</div>
        </div>
        <div class="top-bar-wrapper">
          <div class="top-bar-bg"><div class="top-bar-fill" style="width:${pct}%"></div></div>
          <span class="top-value">${formatMoney(t.valor)}</span>
        </div>
      </div>`;
    }).join('');
  }

  // ===== Calendar =====
  function renderCalendario() {
    const grid = $('#calendarioGrid');
    const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
    const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];

    const transacoesMes = getTransacoesMes(mesAtual, anoAtual);
    const porDia = {};
    transacoesMes.forEach(t => {
      const dia = parseInt(t.vencimento.split('-')[2], 10);
      if (!porDia[dia]) porDia[dia] = [];
      porDia[dia].push(t);
    });

    let html = DIAS_SEMANA.map(d => `<div class="cal-header">${d}</div>`).join('');

    // Empty cells before first day
    for (let i = 0; i < primeiroDia; i++) {
      html += '<div class="cal-day empty"></div>';
    }

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dateStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const isToday = dateStr === hojeStr;
      const items = porDia[dia] || [];

      let dotsHtml = '';
      let amountsHtml = '';
      let totalR = 0, totalD = 0;

      items.forEach(t => {
        dotsHtml += `<span class="cal-dot ${t.tipo}"></span>`;
        if (t.tipo === 'receita') totalR += t.valor;
        else totalD += t.valor;
      });

      if (totalR > 0) amountsHtml += `<div class="cal-amount receita">+${formatMoneyShort(totalR)}</div>`;
      if (totalD > 0) amountsHtml += `<div class="cal-amount despesa">-${formatMoneyShort(totalD)}</div>`;

      html += `<div class="cal-day${isToday ? ' today' : ''}">
        <div class="cal-day-num">${dia}</div>
        <div>${dotsHtml}</div>
        ${amountsHtml}
      </div>`;
    }

    grid.innerHTML = html;
  }

  // ===== Export CSV =====
  function exportarCSV() {
    const lista = getTransacoesFiltradas();
    if (lista.length === 0) {
      toast('Nenhuma transação para exportar', 'error');
      return;
    }

    const headers = ['Vencimento', 'Descrição', 'Tipo', 'Categoria', 'Valor', 'Status', 'Observação'];
    const rows = lista.map(t => {
      const cat = CATEGORIAS[t.categoria] || { nome: t.categoria };
      return [
        t.vencimento,
        `"${t.descricao}"`,
        t.tipo,
        cat.nome,
        t.valor.toFixed(2),
        t.status,
        `"${t.observacao || ''}"`,
      ].join(';');
    });

    const csv = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financas_${MESES[mesAtual]}_${anoAtual}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado!', 'success');
  }

  // ===== Modal =====
  function abrirModal(titulo, mensagem, onConfirm) {
    $('#modalTitle').textContent = titulo;
    $('#modalMessage').textContent = mensagem;
    $('#modalConfirm').style.display = '';
    $('#modalConfirmBtn').onclick = onConfirm;
  }

  function fecharModal() {
    $('#modalConfirm').style.display = 'none';
  }

  // ===== Toast =====
  function toast(msg, type = 'info') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast ${type}`;
    el.style.display = '';
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  // ===== Utils =====
  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function formatMoney(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatMoneyShort(v) {
    if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
    return `R$${v.toFixed(0)}`;
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Expose to window for inline handlers =====
  window._app = {
    editarTransacao,
    excluirTransacao,
    marcarPago,
  };

})();
