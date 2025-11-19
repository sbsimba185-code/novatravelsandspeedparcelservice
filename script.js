/* ---------------------------------------------------------
   CSV Loader + Table Builder + Search + Sorting
   Used by all individual pages (bookings.html, received.html...)
---------------------------------------------------------- */

/* Load CSV and build table for simple pages */
async function loadCSV(csvPath, tableId, searchBoxId) {
    try {
        const response = await fetch(csvPath + "?nocache=" + Date.now());
        const text = await response.text();

        const rows = text.trim().split(/\r?\n/).map(r => r.split(","));
        const headers = rows.shift(); // CSV Header

        const table = document.getElementById(tableId);
        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");

        if (!table || !thead || !tbody) return;

        // Build table header
        thead.innerHTML = "<tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr>";

        // Build table rows
        tbody.innerHTML = "";
        rows.forEach(row => {
            const tr = document.createElement("tr");

            row.forEach((cell, index) => {
                let html = cell;

                // Payment color logic
                if (headers[index].toLowerCase().includes("payment")) {
                    html = formatPayment(cell);
                }

                const td = document.createElement("td");
                td.innerHTML = html;
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        // Enable search for that page
        if (searchBoxId) {
            enableSearch(searchBoxId, tbody);
        }

        // Enable sorting
        enableSorting(table);

    } catch (error) {
        console.error("CSV Load Error:", error);
    }
}

/* -------------------------
   Payment Color Formatter
--------------------------- */
function formatPayment(value) {
    const txt = (value || "").toString().toLowerCase().trim();

    if (txt === "paid" || txt === "2") {
        return `<span class="pay-paid">PAID</span>`;
    }
    if (txt === "to pay" || txt === "1") {
        return `<span class="pay-topay">TO PAY</span>`;
    }
    if (txt === "a/c" || txt === "a\\c" || txt === "3") {
        return `<span class="pay-ac">A/C</span>`;
    }
    return value;
}

/* -------------------------
   Simple Search (per page)
--------------------------- */
function enableSearch(searchBoxId, tbody) {
    const searchBox = document.getElementById(searchBoxId);
    if (!searchBox) return;

    searchBox.addEventListener("input", function () {
        const text = this.value.toLowerCase();
        const rows = tbody.querySelectorAll("tr");

        rows.forEach(row => {
            const content = row.textContent.toLowerCase();
            row.style.display = content.includes(text) ? "" : "none";
        });
    });
}

/* -------------------------
   Sorting Feature
--------------------------- */
function enableSorting(table) {
    if (!table) return;
    const headers = table.querySelectorAll("th");

    headers.forEach((th, colIndex) => {
        let asc = true;

        th.style.cursor = "pointer";
        th.addEventListener("click", () => {
            sortTable(table, colIndex, asc);
            asc = !asc;
        });
    });
}

function sortTable(table, colIndex, asc) {
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    rows.sort((a, b) => {
        let x = a.children[colIndex].innerText.toLowerCase();
        let y = b.children[colIndex].innerText.toLowerCase();

        // Numeric sort if numbers
        if (!isNaN(x) && !isNaN(y) && x !== "" && y !== "") {
            return asc ? (Number(x) - Number(y)) : (Number(y) - Number(x));
        }

        // Normal string sort
        return asc ? x.localeCompare(y) : y.localeCompare(x);
    });

    rows.forEach(row => tbody.appendChild(row)); // reorder
}

/* =========================================================
   ADVANCED SEARCH ON HOME PAGE (Bookings + Received)
   - AND logic
   - Contains matching for text
   - From Place => only Received
   - From Customer => only Bookings
   - Export results to CSV
========================================================= */

let LAST_SEARCH_RESULTS = [];   // unified array for export

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
}

function resetAdvancedSearch() {
    ["f_lr_no","f_date","f_from_customer","f_to_customer",
     "f_to_place","f_from_place","f_quantity","f_amount",
     "f_payment_method"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
     });

    const bookingsSection = document.getElementById("bookingsResultsSection");
    const receivedSection = document.getElementById("receivedResultsSection");
    const noMsg = document.getElementById("noResultsMsg");
    const exportBtn = document.getElementById("exportBtn");

    if (bookingsSection) bookingsSection.style.display = "none";
    if (receivedSection) receivedSection.style.display = "none";
    if (noMsg) {
        noMsg.style.display = "block";
        noMsg.innerHTML = 'Enter search values above and press <b>Search</b>.';
    }
    if (exportBtn) exportBtn.style.display = "none";

    LAST_SEARCH_RESULTS = [];
}

/* Parse CSV text into {headers, rows[]} */
function parseCSVText(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines.shift().split(",");
    const rows = lines.map(line => line.split(","));
    return { headers, rows };
}

/* Main advanced search function */
async function advancedSearch() {
    const filters = {
        lr_no: getVal("f_lr_no").toLowerCase(),
        date: getVal("f_date").toLowerCase(),
        from_customer: getVal("f_from_customer").toLowerCase(),
        to_customer: getVal("f_to_customer").toLowerCase(),
        to_place: getVal("f_to_place").toLowerCase(),
        from_place: getVal("f_from_place").toLowerCase(),
        quantity: getVal("f_quantity"),
        amount: getVal("f_amount"),
        payment_method: getVal("f_payment_method")
    };

    // Require at least one field
    if (!filters.lr_no && !filters.date && !filters.from_customer &&
        !filters.to_customer && !filters.to_place && !filters.from_place &&
        !filters.quantity && !filters.amount && !filters.payment_method) {
        alert("Enter at least one field to search.");
        return;
    }

    // Decide which tables to search
    let searchBookings = true;
    let searchReceived = true;

    if (filters.from_customer && !filters.from_place) {
        searchReceived = false;       // from_customer => only bookings
    }
    if (filters.from_place && !filters.from_customer) {
        searchBookings = false;       // from_place => only received
    }

    const bookingsSection = document.getElementById("bookingsResultsSection");
    const receivedSection = document.getElementById("receivedResultsSection");
    const bookingsTable = document.getElementById("searchBookingsTable");
    const receivedTable = document.getElementById("searchReceivedTable");
    const noMsg = document.getElementById("noResultsMsg");
    const exportBtn = document.getElementById("exportBtn");

    if (!bookingsTable || !receivedTable) return;

    bookingsTable.querySelector("thead").innerHTML = "";
    bookingsTable.querySelector("tbody").innerHTML = "";
    receivedTable.querySelector("thead").innerHTML = "";
    receivedTable.querySelector("tbody").innerHTML = "";

    let anyResults = false;
    LAST_SEARCH_RESULTS = [];

    /* ----- Search bookings.csv ----- */
    if (searchBookings) {
        try {
            const resp = await fetch("data/bookings.csv?nocache=" + Date.now());
            const text = await resp.text();
            const { headers, rows } = parseCSVText(text);

            const matches = rows.filter(row => rowMatchesBooking(row, headers, filters));

            if (matches.length > 0) {
                anyResults = true;
                if (bookingsSection) bookingsSection.style.display = "block";

                const thead = bookingsTable.querySelector("thead");
                const tbody = bookingsTable.querySelector("tbody");

                thead.innerHTML = "<tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr>";

                matches.forEach(row => {
                    const tr = document.createElement("tr");
                    row.forEach((cell, idx) => {
                        let html = cell;
                        if (headers[idx].toLowerCase().includes("payment")) {
                            html = formatPayment(cell);
                        }
                        const td = document.createElement("td");
                        td.innerHTML = html;
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);

                    // Save unified result for export
                    const lr = row[headers.indexOf("LR No")] || "";
                    const dt = row[headers.indexOf("Date")] || "";
                    const cust = row[headers.indexOf("To Customer")] || "";
                    const place = row[headers.indexOf("To Place")] || "";
                    const qty = row[headers.indexOf("Quantity")] || "";
                    const amt = row[headers.indexOf("Amount")] || "";
                    const pay = row[headers.indexOf("Payment Method")] || "";

                    LAST_SEARCH_RESULTS.push({
                        source: "Booking",
                        lr_no: lr,
                        date: dt,
                        customer: cust,
                        from_place: "",
                        to_place: place,
                        quantity: qty,
                        amount: amt,
                        payment_method: pay
                    });
                });

                enableSorting(bookingsTable);
            } else {
                if (bookingsSection) bookingsSection.style.display = "none";
            }
        } catch (err) {
            console.error("Error loading bookings.csv", err);
        }
    } else {
        if (bookingsSection) bookingsSection.style.display = "none";
    }

    /* ----- Search received.csv ----- */
    if (searchReceived) {
        try {
            const resp = await fetch("data/received.csv?nocache=" + Date.now());
            const text = await resp.text();
            const { headers, rows } = parseCSVText(text);

            const matches = rows.filter(row => rowMatchesReceived(row, headers, filters));

            if (matches.length > 0) {
                anyResults = true;
                if (receivedSection) receivedSection.style.display = "block";

                const thead = receivedTable.querySelector("thead");
                const tbody = receivedTable.querySelector("tbody");

                thead.innerHTML = "<tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr>";

                matches.forEach(row => {
                    const tr = document.createElement("tr");
                    row.forEach((cell, idx) => {
                        let html = cell;
                        if (headers[idx].toLowerCase().includes("payment")) {
                            html = formatPayment(cell);
                        }
                        const td = document.createElement("td");
                        td.innerHTML = html;
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);

                    // Save unified result for export
                    const lr = row[headers.indexOf("LR No")] || "";
                    const dt = row[headers.indexOf("Date")] || "";
                    const cust = row[headers.indexOf("To Customer")] || "";
                    const fromp = row[headers.indexOf("From Place")] || "";
                    const top = row[headers.indexOf("To Place")] || "";
                    const qty = row[headers.indexOf("Quantity")] || "";
                    const amt = row[headers.indexOf("Amount")] || "";
                    const pay = row[headers.indexOf("Payment Method")] || "";

                    LAST_SEARCH_RESULTS.push({
                        source: "Received",
                        lr_no: lr,
                        date: dt,
                        customer: cust,
                        from_place: fromp,
                        to_place: top,
                        quantity: qty,
                        amount: amt,
                        payment_method: pay
                    });
                });

                enableSorting(receivedTable);
            } else {
                if (receivedSection) receivedSection.style.display = "none";
            }
        } catch (err) {
            console.error("Error loading received.csv", err);
        }
    } else {
        if (receivedSection) receivedSection.style.display = "none";
    }

    // Update message + export button
    if (noMsg) {
        if (anyResults) {
            noMsg.style.display = "none";
        } else {
            noMsg.style.display = "block";
            noMsg.innerText = "No matching records found.";
        }
    }
    if (exportBtn) {
        exportBtn.style.display = anyResults ? "inline-block" : "none";
    }
}

/* Matching logic for bookings.csv */
function rowMatchesBooking(row, headers, f) {
    function cell(name) {
        const idx = headers.indexOf(name);
        return idx >= 0 ? (row[idx] || "") : "";
    }

    const lr = cell("LR No").toLowerCase();
    const date = cell("Date").toLowerCase();
    const fromCust = cell("From Customer").toLowerCase();
    const toCust = cell("To Customer").toLowerCase();
    const toPlace = cell("To Place").toLowerCase();
    const qty = cell("Quantity").trim();
    const amt = cell("Amount").trim();
    const pay = cell("Payment Method").trim();

    if (f.lr_no && !lr.includes(f.lr_no)) return false;
    if (f.date && !date.includes(f.date)) return false;
    if (f.from_customer && !fromCust.includes(f.from_customer)) return false;
    if (f.to_customer && !toCust.includes(f.to_customer)) return false;
    if (f.to_place && !toPlace.includes(f.to_place)) return false;

    if (f.quantity && qty !== f.quantity) return false;
    if (f.amount && amt !== f.amount) return false;
    if (f.payment_method && pay !== f.payment_method) return false;

    // from_place is not applicable to bookings
    return true;
}

/* Matching logic for received.csv */
function rowMatchesReceived(row, headers, f) {
    function cell(name) {
        const idx = headers.indexOf(name);
        return idx >= 0 ? (row[idx] || "") : "";
    }

    const lr = cell("LR No").toLowerCase();
    const date = cell("Date").toLowerCase();
    const toCust = cell("To Customer").toLowerCase();
    const fromPlace = cell("From Place").toLowerCase();
    const toPlace = cell("To Place").toLowerCase();
    const qty = cell("Quantity").trim();
    const amt = cell("Amount").trim();
    const pay = cell("Payment Method").trim();

    if (f.lr_no && !lr.includes(f.lr_no)) return false;
    if (f.date && !date.includes(f.date)) return false;
    if (f.to_customer && !toCust.includes(f.to_customer)) return false;
    if (f.from_place && !fromPlace.includes(f.from_place)) return false;
    if (f.to_place && !toPlace.includes(f.to_place)) return false;

    if (f.quantity && qty !== f.quantity) return false;
    if (f.amount && amt !== f.amount) return false;
    if (f.payment_method && pay !== f.payment_method) return false;

    // from_customer not used for received
    return true;
}

/* -----------------------------
   Export search results to CSV
------------------------------ */
function exportSearchResults() {
    if (!LAST_SEARCH_RESULTS || LAST_SEARCH_RESULTS.length === 0) {
        alert("No search results to export.");
        return;
    }

    const headers = [
        "Source",
        "LR No",
        "Date",
        "Customer",
        "From Place",
        "To Place",
        "Quantity",
        "Amount",
        "Payment Method"
    ];

    const rows = LAST_SEARCH_RESULTS.map(r => [
        r.source,
        r.lr_no,
        r.date,
        r.customer,
        r.from_place,
        r.to_place,
        r.quantity,
        r.amount,
        r.payment_method
    ]);

    const csvLines = [];
    csvLines.push(headers.join(","));
    rows.forEach(row => {
        const line = row.map(v => {
            const val = (v == null ? "" : String(v));
            if (val.includes(",") || val.includes("\"")) {
                return '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        }).join(",");
        csvLines.push(line);
    });

    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "search_results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
