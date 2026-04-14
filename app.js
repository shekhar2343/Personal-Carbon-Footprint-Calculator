const STORAGE_KEY = "ecoTrackResults";
const LAST_RESULT_KEY = "ecoTrackLastResult";
const GLOBAL_AVERAGE = 4700;

const EMISSION_FACTORS = {
  carKgPerKm: 0.192,
  publicTransportKgPerKm: 0.105,
  flightKgPerFlight: 255,
  electricityKgPerKwh: 0.42,
  wasteKgPerKg: 1.85,
  dietKgPerYear: {
    "non-vegetarian": 1650,
    vegetarian: 1100,
    vegan: 800,
  },
  shoppingKgPerYear: {
    low: 180,
    medium: 360,
    high: 720,
  },
  waterKgPerYear: {
    low: 90,
    medium: 180,
    high: 320,
  },
};

const form = document.getElementById("carbonForm");
const totalFootprint = document.getElementById("totalFootprint");
const comparisonText = document.getElementById("comparisonText");
const tipsList = document.getElementById("tipsList");
const historyList = document.getElementById("historyList");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const analysisSummary = document.getElementById("analysisSummary");
const chartGuideList = document.getElementById("chartGuideList");
const saveResultBtn = document.getElementById("saveResultBtn");
const loadLastResultBtn = document.getElementById("loadLastResultBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const resetFormBtn = document.getElementById("resetFormBtn");

const aiSuggestionsBtn = document.getElementById("generateAiSuggestionsBtn");
const aiSuggestionsList = document.getElementById("aiSuggestionsList");
const aiSuggestionsStatus = document.getElementById("aiSuggestionsStatus");
const aiReportBtn = document.getElementById("generateAiReportBtn");
const aiReportStatus = document.getElementById("aiReportStatus");
const aiReportSummary = document.getElementById("aiReportSummary");
const aiEmissionSources = document.getElementById("aiEmissionSources");
const aiImprovements = document.getElementById("aiImprovements");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatStatus = document.getElementById("chatStatus");

let pieChart;
let barChart;
let monthlyLineChart;
let transportBarChart;
let lifestylePieChart;
let currentResult = null;
const API_BASE_URL = (() => {
  const configuredBase = window.ECOTRACK_API_BASE_URL || "";
  return configuredBase.replace(/\/+$/, "");
})();
let chatHistory = [
  {
    role: "assistant",
    content:
      "Ask me about sustainable travel, food choices, home energy, or how to lower the emissions from your latest footprint estimate.",
  },
];

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function resolveApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function getAiConnectionHelp() {
  if (isFileProtocol()) {
    return "AI features need the Node server. Start it with `npm start`, then open `http://localhost:3000` instead of opening `index.html` directly.";
  }

  return "The AI service could not be reached. Make sure the backend server is running and this page is opened from that server.";
}

function normalizeApiError(error) {
  const message = String(error?.message || "").trim();

  if (
    error instanceof TypeError &&
    /fetch failed|failed to fetch|load failed|networkerror/i.test(message)
  ) {
    return getAiConnectionHelp();
  }

  return message || "Something went wrong while contacting the AI service.";
}

function getFormData() {
  const data = new FormData(form);

  return {
    carKm: Number(data.get("carKm")) || 0,
    bikeKm: Number(data.get("bikeKm")) || 0,
    publicTransportKm: Number(data.get("publicTransportKm")) || 0,
    flightsPerYear: Number(data.get("flightsPerYear")) || 0,
    electricityKwh: Number(data.get("electricityKwh")) || 0,
    dietType: data.get("dietType"),
    wasteKg: Number(data.get("wasteKg")) || 0,
    shoppingFrequency: data.get("shoppingFrequency"),
    waterUsage: data.get("waterUsage"),
  };
}

function calculateFootprint(input) {
  const yearlyCar = input.carKm * 52 * EMISSION_FACTORS.carKgPerKm;
  const yearlyBike = input.bikeKm * 52 * 0;
  const yearlyPublicTransport =
    input.publicTransportKm * 52 * EMISSION_FACTORS.publicTransportKgPerKm;
  const yearlyFlights = input.flightsPerYear * EMISSION_FACTORS.flightKgPerFlight;
  const yearlyElectricity =
    input.electricityKwh * 12 * EMISSION_FACTORS.electricityKgPerKwh;
  const yearlyDiet = EMISSION_FACTORS.dietKgPerYear[input.dietType];
  const yearlyWaste = input.wasteKg * 52 * EMISSION_FACTORS.wasteKgPerKg;
  const yearlyShopping =
    EMISSION_FACTORS.shoppingKgPerYear[input.shoppingFrequency];
  const yearlyWater = EMISSION_FACTORS.waterKgPerYear[input.waterUsage];

  const componentBreakdown = {
    Car: yearlyCar,
    Bike: yearlyBike,
    "Public Transport": yearlyPublicTransport,
    Flights: yearlyFlights,
    Electricity: yearlyElectricity,
    Diet: yearlyDiet,
    Waste: yearlyWaste,
    Shopping: yearlyShopping,
    Water: yearlyWater,
  };

  const breakdown = {
    Transport: yearlyCar + yearlyBike + yearlyPublicTransport + yearlyFlights,
    Electricity: yearlyElectricity,
    Diet: yearlyDiet,
    Waste: yearlyWaste,
    Lifestyle: yearlyShopping + yearlyWater,
  };

  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { total, breakdown, componentBreakdown };
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getComparisonText(total) {
  const difference = Math.abs(total - GLOBAL_AVERAGE);
  const direction = total <= GLOBAL_AVERAGE ? "below" : "above";
  const impactLabel =
    total < 2000
      ? "excellent low-impact range"
      : total < GLOBAL_AVERAGE
        ? "better than average"
        : "higher than average";

  return `You are ${formatNumber(
    difference
  )} kg CO2/year ${direction} the global average of ${formatNumber(
    GLOBAL_AVERAGE
  )} kg. This places you in the ${impactLabel}.`;
}

function generateSuggestions(input, breakdown) {
  const suggestions = [];

  if (input.carKm > 80) {
    suggestions.push(
      "Reduce weekly car travel where possible by combining errands, carpooling, or shifting a few short trips to cycling."
    );
  }

  if (input.flightsPerYear >= 3) {
    suggestions.push(
      "Flights are a major emissions driver in your profile. Replacing even one annual flight with rail or virtual meetings can noticeably cut your total."
    );
  }

  if (input.electricityKwh > 250) {
    suggestions.push(
      "Your electricity usage is on the higher side. Try efficient cooling, LED lighting, and appliance scheduling to lower monthly kWh."
    );
  }

  if (input.dietType === "non-vegetarian") {
    suggestions.push(
      "Shifting a few meals each week toward plant-based options can reduce diet-related emissions over the year."
    );
  }

  if (input.shoppingFrequency === "high") {
    suggestions.push(
      "Frequent shopping increases embodied emissions. Focus on durable goods, repair cycles, and second-hand options."
    );
  }

  if (input.wasteKg > 7) {
    suggestions.push(
      "Reducing food waste and separating recyclable or compostable material can lower your waste footprint."
    );
  }

  if (input.waterUsage === "high") {
    suggestions.push(
      "Water-saving fixtures, shorter showers, and full laundry loads can trim your lifestyle emissions."
    );
  }

  const topCategory = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topCategory && suggestions.length < 4) {
    suggestions.push(
      `Your largest category is ${topCategory.toLowerCase()}. Prioritizing changes there will give you the fastest emissions reduction.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Your profile is already relatively efficient. Keep tracking progress and focus on consistency, renewable energy, and low-waste habits."
    );
  }

  return suggestions.slice(0, 5);
}

function renderSuggestions(suggestions) {
  tipsList.innerHTML = "";
  suggestions.forEach((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    tipsList.appendChild(item);
  });
}

function renderAiSuggestions(suggestions) {
  aiSuggestionsList.innerHTML = "";

  if (!suggestions?.length) {
    aiSuggestionsList.innerHTML =
      "<li>Generate AI suggestions to see tailored reduction ideas.</li>";
    return;
  }

  suggestions.forEach((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    aiSuggestionsList.appendChild(item);
  });
}

function renderAiReport(report) {
  aiReportSummary.textContent =
    report?.summary || "Generate a report to get a clearer picture of your footprint.";

  aiEmissionSources.innerHTML = "";
  aiImprovements.innerHTML = "";

  if (!report?.majorSources?.length) {
    aiEmissionSources.innerHTML =
      "<li>Your biggest emission sources will appear here after report generation.</li>";
  } else {
    report.majorSources.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      aiEmissionSources.appendChild(li);
    });
  }

  if (!report?.actionableImprovements?.length) {
    aiImprovements.innerHTML =
      "<li>Actionable improvements will appear here once the AI report is ready.</li>";
  } else {
    report.actionableImprovements.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      aiImprovements.appendChild(li);
    });
  }
}

function renderChatMessages() {
  chatMessages.innerHTML = "";

  chatHistory.forEach((message) => {
    const article = document.createElement("article");
    article.className = `chat-message ${message.role}`;

    const roleLabel = document.createElement("strong");
    roleLabel.textContent = message.role === "user" ? "You" : "Eco AI";

    const content = document.createElement("p");
    content.textContent = message.content;

    article.append(roleLabel, content);
    chatMessages.appendChild(article);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function postJson(url, payload) {
  let response;

  try {
    response = await fetch(resolveApiUrl(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(normalizeApiError(error));
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong while contacting the AI service.");
  }

  return data;
}

function destroyChart(chart) {
  if (chart) {
    chart.destroy();
  }
}

function renderAnalysisGuide() {
  const lines = [
    "Pie chart: best for showing the share of each emission category in one result.",
    "Bar chart: best for comparing category sizes side by side.",
    "Line chart: best for showing how emissions build up or change across a sequence such as months.",
    "Use the original pie and bar charts for category overview, then use the extra line and bar charts for detail.",
  ];

  chartGuideList.innerHTML = "";
  lines.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    chartGuideList.appendChild(item);
  });
}

function renderAnalysisSummary(result) {
  if (!result) {
    analysisSummary.textContent =
      "Calculate your footprint to unlock more detailed chart-based analysis.";
    return;
  }

  const topCategory = Object.entries(result.breakdown || {}).sort((a, b) => b[1] - a[1])[0];
  const topTransportSource = Object.entries({
    Car: result.componentBreakdown?.Car || 0,
    "Public transport": result.componentBreakdown?.["Public Transport"] || 0,
    Flights: result.componentBreakdown?.Flights || 0,
  }).sort((a, b) => b[1] - a[1])[0];

  analysisSummary.textContent = `Your biggest category is ${
    topCategory ? topCategory[0].toLowerCase() : "overall emissions"
  }, contributing about ${topCategory ? formatNumber(topCategory[1]) : "0"} kg CO2/year. In transport, ${
    topTransportSource ? topTransportSource[0].toLowerCase() : "travel"
  } is the largest driver. The added line chart shows how your yearly footprint builds month by month, while the extra bar and pie charts break transport and lifestyle sources into clearer pieces.`;
}

function buildExtraCharts(result) {
  const lineCanvas = document.getElementById("monthlyLineChart");
  const transportCanvas = document.getElementById("transportBarChart");
  const lifestyleCanvas = document.getElementById("lifestylePieChart");

  destroyChart(monthlyLineChart);
  destroyChart(transportBarChart);
  destroyChart(lifestylePieChart);
  monthlyLineChart = null;
  transportBarChart = null;
  lifestylePieChart = null;

  renderAnalysisSummary(result);
  renderAnalysisGuide();

  if (!result || !lineCanvas || !transportCanvas || !lifestyleCanvas) {
    return;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyTotal = result.total / 12;
  const monthlyCumulative = months.map((_, index) =>
    Number((monthlyTotal * (index + 1)).toFixed(0))
  );

  monthlyLineChart = new Chart(lineCanvas, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "Cumulative annual footprint",
          data: monthlyCumulative,
          borderColor: "#2f7d4a",
          backgroundColor: "rgba(47, 125, 74, 0.18)",
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "kg CO2/year",
          },
        },
      },
    },
  });

  const transportLabels = ["Car", "Public Transport", "Flights", "Bike"];
  const transportValues = transportLabels.map((label) =>
    Number((result.componentBreakdown?.[label] || 0).toFixed(0))
  );

  transportBarChart = new Chart(transportCanvas, {
    type: "bar",
    data: {
      labels: transportLabels,
      datasets: [
        {
          label: "kg CO2/year",
          data: transportValues,
          backgroundColor: ["#2f7d4a", "#5fa266", "#c98e3b", "#9ec7ae"],
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "kg CO2/year",
          },
        },
      },
    },
  });

  const lifestyleLabels = ["Electricity", "Diet", "Waste", "Shopping", "Water"];
  const lifestyleValues = lifestyleLabels.map((label) =>
    Number((result.componentBreakdown?.[label] || 0).toFixed(0))
  );

  lifestylePieChart = new Chart(lifestyleCanvas, {
    type: "pie",
    data: {
      labels: lifestyleLabels,
      datasets: [
        {
          data: lifestyleValues,
          backgroundColor: ["#2f7d4a", "#5fa266", "#c98e3b", "#8d6f48", "#7db8a2"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}

function buildCharts(breakdown, componentBreakdown) {
  const labels = Object.keys(breakdown);
  const values = Object.values(breakdown).map((value) => Number(value.toFixed(0)));
  const colors = ["#2f7d4a", "#5fa266", "#c98e3b", "#8d6f48", "#7db8a2"];

  destroyChart(pieChart);
  destroyChart(barChart);

  pieChart = new Chart(document.getElementById("footprintPieChart"), {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });

  barChart = new Chart(document.getElementById("footprintBarChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "kg CO2/year",
          data: values,
          backgroundColor: colors,
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });

  buildExtraCharts({
    total: currentResult?.total || 0,
    breakdown,
    componentBreakdown,
  });
}

function renderResult(input) {
  const { total, breakdown, componentBreakdown } = calculateFootprint(input);
  const suggestions = generateSuggestions(input, breakdown);

  currentResult = {
    timestamp: new Date().toISOString(),
    input,
    total,
    breakdown,
    componentBreakdown,
    suggestions,
  };

  totalFootprint.textContent = `${formatNumber(total)} kg CO2/year`;
  comparisonText.textContent = getComparisonText(total);
  renderSuggestions(suggestions);
  buildCharts(breakdown, componentBreakdown);

  localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(currentResult));
}

function readSavedResults() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveCurrentResult() {
  if (!currentResult) {
    comparisonText.textContent = "Calculate your footprint before saving a result.";
    return;
  }

  const saved = readSavedResults();
  saved.unshift(currentResult);
  const trimmed = saved.slice(0, 6);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  renderHistory();
}

function renderHistory() {
  const saved = readSavedResults();
  historyList.innerHTML = "";

  if (!saved.length) {
    historyList.innerHTML =
      '<div class="history-item"><strong>No saved results yet</strong><div class="history-meta">Save your first estimate to track progress over time.</div></div>';
    progressFill.style.width = "0%";
    progressText.textContent =
      "Save a few results to see whether your footprint is moving in the right direction.";
    buildExtraCharts(currentResult);
    return;
  }

  saved.forEach((entry, index) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const date = new Date(entry.timestamp).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const changeText =
      index < saved.length - 1
        ? `${Math.round(entry.total - saved[index + 1].total)} kg vs previous`
        : "Baseline saved result";

    item.innerHTML = `
      <strong>${formatNumber(entry.total)} kg CO2/year</strong>
      <div class="history-meta">${date} | ${changeText}</div>
    `;
    historyList.appendChild(item);
  });

  const latest = saved[0].total;
  const oldest = saved[saved.length - 1].total;
  const improvement = oldest > 0 ? Math.max(0, ((oldest - latest) / oldest) * 100) : 0;
  progressFill.style.width = `${Math.min(100, improvement)}%`;
  progressText.textContent =
    improvement > 0
      ? `Nice progress: your latest saved footprint is ${improvement.toFixed(
          1
        )}% lower than your earliest saved result.`
      : "No reduction trend yet. Use the tips above and save a new check-in after making changes.";
  buildExtraCharts(currentResult);
}

function populateForm(input) {
  Object.entries(input).forEach(([key, value]) => {
    if (form.elements[key]) {
      form.elements[key].value = value;
    }
  });
}

function addWrappedText(pdf, text, x, y, maxWidth, lineHeight = 6) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function addSectionTitle(pdf, title, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(36, 51, 40);
  pdf.text(title, 16, y);
  return y + 8;
}

function ensureSpace(pdf, y, neededHeight) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (y + neededHeight > pageHeight - 12) {
    pdf.addPage();
    return 20;
  }

  return y;
}

async function downloadReport() {
  if (!window.jspdf?.jsPDF) {
    throw new Error("PDF library unavailable");
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 32;

  pdf.setFillColor(244, 241, 231);
  pdf.rect(0, 0, pageWidth, pdf.internal.pageSize.getHeight(), "F");

  let y = 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(29, 91, 54);
  pdf.text("EcoTrack Carbon Footprint Report", 16, y);

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(95, 111, 99);
  pdf.text(`Generated on ${new Date().toLocaleString("en-IN")}`, 16, y);

  y += 14;
  y = addSectionTitle(pdf, "Annual Summary", y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(36, 51, 40);
  pdf.text(`${formatNumber(currentResult.total)} kg CO2/year`, 16, y);

  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(95, 111, 99);
  y = addWrappedText(pdf, getComparisonText(currentResult.total), 16, y, contentWidth);

  y += 6;
  y = addSectionTitle(pdf, "Input Snapshot", y);
  pdf.setFontSize(11);
  pdf.setTextColor(36, 51, 40);

  const inputLines = [
    `Car travel: ${currentResult.input.carKm} km/week`,
    `Bike travel: ${currentResult.input.bikeKm} km/week`,
    `Public transport: ${currentResult.input.publicTransportKm} km/week`,
    `Flights: ${currentResult.input.flightsPerYear} per year`,
    `Electricity usage: ${currentResult.input.electricityKwh} kWh/month`,
    `Diet type: ${currentResult.input.dietType}`,
    `Waste generation: ${currentResult.input.wasteKg} kg/week`,
    `Shopping frequency: ${currentResult.input.shoppingFrequency}`,
    `Water usage: ${currentResult.input.waterUsage}`,
  ];

  inputLines.forEach((line) => {
    y = ensureSpace(pdf, y, 8);
    pdf.text(`- ${line}`, 18, y);
    y += 7;
  });

  y += 2;
  y = addSectionTitle(pdf, "Emission Breakdown", y);
  Object.entries(currentResult.breakdown).forEach(([label, value]) => {
    y = ensureSpace(pdf, y, 8);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}:`, 18, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${formatNumber(value)} kg CO2/year`, 58, y);
    y += 7;
  });

  y += 2;
  y = addSectionTitle(pdf, "Personalized Suggestions", y);
  currentResult.suggestions.forEach((suggestion) => {
    y = ensureSpace(pdf, y, 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(36, 51, 40);
    y = addWrappedText(pdf, `- ${suggestion}`, 18, y, contentWidth - 2);
    y += 2;
  });

  const pieCanvas = document.getElementById("footprintPieChart");
  const barCanvas = document.getElementById("footprintBarChart");
  const pieImage = pieCanvas?.toDataURL?.("image/png", 1.0);
  const barImage = barCanvas?.toDataURL?.("image/png", 1.0);

  if (pieImage || barImage) {
    pdf.addPage();
    pdf.setFillColor(244, 241, 231);
    pdf.rect(0, 0, pageWidth, pdf.internal.pageSize.getHeight(), "F");
    y = 20;
    y = addSectionTitle(pdf, "Charts", y);

    if (pieImage) {
      pdf.addImage(pieImage, "PNG", 16, y, 82, 82);
    }

    if (barImage) {
      pdf.addImage(barImage, "PNG", 108, y, 86, 82);
    }
  }

  pdf.save("carbon-footprint-report.pdf");
}

async function handleAiSuggestions() {
  if (!currentResult) {
    aiSuggestionsStatus.textContent = "Calculate your footprint first to generate AI suggestions.";
    return;
  }

  aiSuggestionsBtn.disabled = true;
  aiSuggestionsBtn.textContent = "Generating...";
  aiSuggestionsStatus.textContent = "Analyzing your transport, food, electricity, and lifestyle data.";

  try {
    const data = await postJson("/ai-suggestions", {
      result: currentResult,
    });

    renderAiSuggestions(data.suggestions);
    aiSuggestionsStatus.textContent = "AI suggestions are ready.";
  } catch (error) {
    aiSuggestionsStatus.textContent = normalizeApiError(error);
  } finally {
    aiSuggestionsBtn.disabled = false;
    aiSuggestionsBtn.textContent = "Generate AI Suggestions";
  }
}

async function handleAiReport() {
  if (!currentResult) {
    aiReportStatus.textContent = "Calculate your footprint first to generate an AI report.";
    return;
  }

  aiReportBtn.disabled = true;
  aiReportBtn.textContent = "Generating...";
  aiReportStatus.textContent = "Building your AI report.";

  try {
    const data = await postJson("/ai-report", {
      result: currentResult,
    });

    renderAiReport(data.report);
    aiReportStatus.textContent = "AI report generated successfully.";
  } catch (error) {
    aiReportStatus.textContent = normalizeApiError(error);
  } finally {
    aiReportBtn.disabled = false;
    aiReportBtn.textContent = "Generate AI Report";
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const question = chatInput.value.trim();
  if (!question) {
    return;
  }

  chatHistory.push({
    role: "user",
    content: question,
  });
  renderChatMessages();
  chatInput.value = "";
  chatStatus.textContent = "Eco AI is thinking.";

  try {
    const data = await postJson("/chat", {
      messages: chatHistory,
      result: currentResult,
    });

    chatHistory.push({
      role: "assistant",
      content: data.answer,
    });
    renderChatMessages();
    chatStatus.textContent = "Ask another question about sustainability.";
  } catch (error) {
    chatHistory.push({
      role: "assistant",
      content: `I hit a problem reaching the AI service: ${normalizeApiError(error)}`,
    });
    renderChatMessages();
    chatStatus.textContent = "The latest reply could not be generated cleanly.";
  }
}

function resetApp() {
  form.reset();
  totalFootprint.textContent = "0 kg CO2/year";
  comparisonText.textContent =
    "Complete the form to compare your footprint against the global average.";
  tipsList.innerHTML = "<li>Start with an estimate to unlock reduction tips.</li>";
  renderAiSuggestions([]);
  renderAiReport(null);
  aiSuggestionsStatus.textContent = "AI suggestions will appear here.";
  aiReportStatus.textContent = "Generate a report for a deeper analysis.";
  chatHistory = [
    {
      role: "assistant",
      content:
        "Ask me about sustainable travel, food choices, home energy, or how to lower the emissions from your latest footprint estimate.",
    },
  ];
  renderChatMessages();
  chatStatus.textContent = "Start a chat about sustainability.";
  currentResult = null;

  destroyChart(pieChart);
  destroyChart(barChart);
  destroyChart(monthlyLineChart);
  destroyChart(transportBarChart);
  destroyChart(lifestylePieChart);
  pieChart = null;
  barChart = null;
  monthlyLineChart = null;
  transportBarChart = null;
  lifestylePieChart = null;
  renderAnalysisSummary(null);
  renderAnalysisGuide();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult(getFormData());
  aiSuggestionsStatus.textContent = "Your latest result is ready for AI suggestions.";
  aiReportStatus.textContent = "Generate a report for a deeper analysis.";
});

saveResultBtn.addEventListener("click", saveCurrentResult);

loadLastResultBtn.addEventListener("click", () => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_RESULT_KEY));
    if (!stored) {
      comparisonText.textContent = "No recent result found yet. Calculate your footprint first.";
      return;
    }

    populateForm(stored.input);
    renderResult(stored.input);
  } catch (error) {
    comparisonText.textContent = "Unable to load the last result from storage.";
  }
});

downloadPdfBtn.addEventListener("click", async () => {
  if (!currentResult) {
    comparisonText.textContent = "Calculate your footprint before downloading a report.";
    return;
  }

  try {
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.textContent = "Generating...";
    await downloadReport();
  } catch (error) {
    comparisonText.textContent =
      "Unable to generate the PDF report in this browser session. Please refresh and try again.";
  } finally {
    downloadPdfBtn.disabled = false;
    downloadPdfBtn.textContent = "Download PDF";
  }
});

resetFormBtn.addEventListener("click", resetApp);
aiSuggestionsBtn.addEventListener("click", handleAiSuggestions);
aiReportBtn.addEventListener("click", handleAiReport);
chatForm.addEventListener("submit", handleChatSubmit);

renderHistory();
renderAiSuggestions([]);
renderAiReport(null);
renderChatMessages();

if (isFileProtocol()) {
  const helpMessage = getAiConnectionHelp();
  aiSuggestionsStatus.textContent = helpMessage;
  aiReportStatus.textContent = helpMessage;
  chatStatus.textContent = helpMessage;
}
