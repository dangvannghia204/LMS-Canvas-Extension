document.addEventListener('DOMContentLoaded', () => {
    // Phục hồi dữ liệu đăng nhập
    chrome.storage.local.get(['canvasUrl', 'canvasToken', 'courseId', 'gsheetUrl'], (res) => {
        if (res.canvasUrl) document.getElementById('url').value = res.canvasUrl;
        if (res.canvasToken) document.getElementById('token').value = res.canvasToken;
        if (res.courseId) document.getElementById('course_id').value = res.courseId;
        if (res.gsheetUrl) document.getElementById('gsheet_url').value = res.gsheetUrl; 
    });

    let globalStudents = []; 
    let globalAssignments = [];
    let currentSort = { column: 'name', dir: 'asc' }; 

    function formatName(name) {
        if (!name) return "";
        return name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    document.getElementById('btn_connect').addEventListener('click', async () => {
        const url = document.getElementById('url').value.trim().replace(/\/$/, "");
        const token = document.getElementById('token').value.trim();
        const courseId = document.getElementById('course_id').value.trim();

        if (!url || !token || !courseId) return alert("Vui lòng nhập đủ URL, Token và Course ID");

        chrome.storage.local.set({ canvasUrl: url, canvasToken: token, courseId: courseId });
        const btn = document.getElementById('btn_connect');
        btn.disabled = true;
        btn.innerText = "Đang tải...";

        try {
            const sections = await fetchPaginated(`${url}/api/v1/courses/${courseId}/sections`, token);
            const select = document.getElementById('section_select');
            select.innerHTML = '';
            sections.forEach(sec => {
                const option = document.createElement('option');
                option.value = sec.id;
                option.textContent = sec.name;
                select.appendChild(option);
            });
            select.disabled = false;
            document.getElementById('btn_fetch').disabled = false;
        } catch (error) {
            alert("Lỗi kết nối: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Kết nối & Tải Lớp";
        }
    });

    document.getElementById('btn_fetch').addEventListener('click', async () => {
        const url = document.getElementById('url').value.trim().replace(/\/$/, "");
        const token = document.getElementById('token').value.trim();
        const courseId = document.getElementById('course_id').value.trim();
        const sectionId = document.getElementById('section_select').value;

        document.getElementById('btn_fetch').disabled = true;
        document.getElementById('btn_export').disabled = true;
        document.getElementById('btn_gsheet').disabled = true;
        document.getElementById('loading').style.display = 'inline';
        document.getElementById('table_body').innerHTML = '';

        try {
            const enrollments = await fetchPaginated(`${url}/api/v1/sections/${sectionId}/enrollments?type[]=StudentEnrollment&include[]=user`, token);
            const studentDict = {};
            enrollments.forEach(e => {
                if (e.user) {
                    let user = e.user;
                    let rawIdsv = user.sis_user_id || user.login_id || String(user.id);
                    studentDict[user.id] = { name: formatName(user.name), idsv: rawIdsv.replace(/\D/g, '') };
                }
            });

            if (Object.keys(studentDict).length === 0) throw new Error("Lớp này không có sinh viên.");

            const assignments = await fetchPaginated(`${url}/api/v1/courses/${courseId}/assignments`, token);
            globalAssignments = assignments.map(a => ({ id: String(a.id), name: a.name }));

            const submissions = await fetchPaginated(`${url}/api/v1/sections/${sectionId}/students/submissions?student_ids[]=all`, token);
            const subDict = {};
            submissions.forEach(sub => { subDict[`${sub.user_id}_${sub.assignment_id}`] = sub; });

            globalStudents = [];
            Object.entries(studentDict).forEach(([userId, stuInfo]) => {
                let studentObj = { idsv: stuInfo.idsv, name: stuInfo.name, scores: {} };

                globalAssignments.forEach(assign => {
                    let sub = subDict[`${userId}_${assign.id}`];
                    if (!sub || sub.missing || sub.workflow_state === 'unsubmitted') {
                        studentObj.scores[assign.id] = { text: "Chưa làm", val: -1, missing: true, low: false };
                    } else {
                        let score = sub.score;
                        if (score === null) {
                            studentObj.scores[assign.id] = { text: "Chưa chấm", val: -0.5, missing: false, low: false };
                        } else {
                            let parsed = parseFloat(score);
                            if (!isNaN(parsed)) {
                                let displayScore = (Math.round(parsed * 10) / 10).toFixed(1); 
                                let roundedVal = parseFloat(displayScore);
                                
                                if (roundedVal < 5.0) {
                                    studentObj.scores[assign.id] = { text: `${displayScore} ⚠️`, val: roundedVal, missing: false, low: true };
                                } else {
                                    studentObj.scores[assign.id] = { text: displayScore, val: roundedVal, missing: false, low: false };
                                }
                            } else {
                                studentObj.scores[assign.id] = { text: String(score), val: 0, missing: false, low: false };
                            }
                        }
                    }
                });
                globalStudents.push(studentObj);
            });

            currentSort = { column: 'name', dir: 'asc' };
            renderTable();

        } catch (error) {
            alert("Lỗi khi tải: " + error.message);
        } finally {
            document.getElementById('btn_fetch').disabled = false;
            document.getElementById('btn_export').disabled = false;
            document.getElementById('btn_gsheet').disabled = false;
            document.getElementById('loading').style.display = 'none';
        }
    });

    document.getElementById('filter_select').addEventListener('change', renderTable);
    document.getElementById('assign_filter').addEventListener('input', renderTable);

    function sortData() {
        globalStudents.sort((a, b) => {
            let valA, valB;
            if (currentSort.column === 'idsv' || currentSort.column === 'name') {
                valA = a[currentSort.column];
                valB = b[currentSort.column];
                let cmp = String(valA).localeCompare(String(valB), 'vi', {numeric: true});
                return currentSort.dir === 'asc' ? cmp : -cmp;
            } else {
                valA = a.scores[currentSort.column] ? a.scores[currentSort.column].val : 0;
                valB = b.scores[currentSort.column] ? b.scores[currentSort.column].val : 0;
                
                if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
                if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
                return 0;
            }
        });
    }

    function renderTable() {
        const rowFilter = document.getElementById('filter_select').value;
        const colFilter = document.getElementById('assign_filter').value.trim().toLowerCase();
        
        const visibleAssignments = globalAssignments.filter(a => a.name.toLowerCase().includes(colFilter));
        sortData();

        const thead = document.getElementById('table_header');
        const getSortIcon = (col) => {
            if (currentSort.column === col) return currentSort.dir === 'asc' ? '▲' : '▼';
            return '↕'; 
        };

        thead.innerHTML = `
            <th>TT</th>
            <th class="sortable" data-col="idsv" title="Click để sắp xếp theo ID">IDSV <span class="sort-icon">${getSortIcon('idsv')}</span></th>
            <th class="sortable" data-col="name" title="Click để sắp xếp theo Tên">Họ tên <span class="sort-icon">${getSortIcon('name')}</span></th>
        `;
        visibleAssignments.forEach(a => {
            thead.innerHTML += `<th class="sortable" data-col="${a.id}" title="Click để sắp xếp điểm">${a.name} <span class="sort-icon">${getSortIcon(a.id)}</span></th>`;
        });
        thead.innerHTML += `<th>Ghi chú</th>`;

        thead.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.getAttribute('data-col');
                if (currentSort.column === col) {
                    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc'; 
                } else {
                    currentSort.column = col;
                    currentSort.dir = 'desc'; 
                    if(col === 'name' || col === 'idsv') currentSort.dir = 'asc'; 
                }
                renderTable(); 
            });
        });

        const tbody = document.getElementById('table_body');
        tbody.innerHTML = '';
        
        let stt = 1;
        globalStudents.forEach(stu => {
            let missingCount = 0;
            let lowScoreCount = 0;

            visibleAssignments.forEach(a => {
                if (stu.scores[a.id].missing) missingCount++;
                if (stu.scores[a.id].low) lowScoreCount++;
            });

            let tag = "completed";
            let noteText = "Hoàn thành đủ";
            if (missingCount > 0) {
                tag = "missing";
                noteText = `Thiếu ${missingCount} bài`;
            } else if (lowScoreCount > 0) {
                tag = "low_score";
                noteText = `Có ${lowScoreCount} bài < 5đ`;
            }

            if (rowFilter === "missing" && tag !== "missing") return;
            if (rowFilter === "completed" && (tag === "missing" || tag === "low_score")) return;

            const tr = document.createElement('tr');
            if (tag === "missing") tr.className = "row-missing";
            if (tag === "low_score") tr.className = "row-low-score";

            let rowHTML = `<td>${stt}</td><td>${stu.idsv}</td><td>${stu.name}</td>`;
            visibleAssignments.forEach(a => {
                rowHTML += `<td>${stu.scores[a.id].text}</td>`;
            });
            rowHTML += `<td>${noteText}</td>`;

            tr.innerHTML = rowHTML;
            tbody.appendChild(tr);
            stt++;
        });
    }

    // --- XUẤT CSV ---
    document.getElementById('btn_export').addEventListener('click', () => {
        let csvContent = "\uFEFF"; 
        const escapeCSV = (text) => {
            if (text === null || text === undefined) return '""';
            let str = String(text).replace(/[\r\n]+/g, ' ').trim(); 
            str = str.replace(/"/g, '""'); 
            return `"${str}"`;
        };

        const headers = Array.from(document.querySelectorAll("#table_header th")).map(th => escapeCSV(th.textContent.replace(/[↕▲▼]/g, '').trim()));
        csvContent += headers.join(",") + "\r\n";

        document.querySelectorAll("#table_body tr").forEach(tr => {
            const cells = Array.from(tr.querySelectorAll("td")).map(td => escapeCSV(td.textContent));
            csvContent += cells.join(",") + "\r\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Bang_Diem_Canvas_Loc.csv";
        link.click();
    });

    // --- ĐỒNG BỘ GOOGLE SHEET THEO TỪNG LỚP ---
    document.getElementById('btn_gsheet').addEventListener('click', async () => {
        const gsheetUrl = document.getElementById('gsheet_url').value.trim();
        if (!gsheetUrl) return alert("Vui lòng nhập Web App URL của Google Sheet!");

        chrome.storage.local.set({ gsheetUrl: gsheetUrl });

        // Lấy Tên Lớp đang được chọn để làm Tên Sheet
        const sectionSelect = document.getElementById('section_select');
        const sectionName = sectionSelect.options[sectionSelect.selectedIndex].text;

        const headers = Array.from(document.querySelectorAll("#table_header th")).map(th => th.textContent.replace(/[↕▲▼]/g, '').trim());
        const rows = [];
        document.querySelectorAll("#table_body tr").forEach(tr => {
            const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
            rows.push(cells);
        });

        const btn = document.getElementById('btn_gsheet');
        btn.innerText = "Đang đẩy dữ liệu...";
        btn.disabled = true;

        try {
            // Truyền tham số sheetName vào Payload
            const response = await fetch(gsheetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    sheetName: sectionName,
                    headers: headers, 
                    rows: rows 
                })
            });
            
            const result = await response.json();
            if (result.status === "success") {
                alert(`Đồng bộ thành công!\nĐiểm của lớp "${sectionName}" đã được đẩy vào Tab tương ứng trên Google Sheet.`);
            } else {
                alert("Lỗi từ hệ thống Google: " + result.message);
            }
        } catch (error) {
            alert("Lỗi mạng khi gọi tới Web App: " + error.message);
        } finally {
            btn.innerText = "Đẩy lên Google Sheet";
            btn.disabled = false;
        }
    });

    async function fetchPaginated(url, token) {
        let results = [];
        let nextUrl = url.includes('?') ? `${url}&per_page=100` : `${url}?per_page=100`;

        while (nextUrl) {
            const response = await fetch(nextUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            results = results.concat(data);

            const linkHeader = response.headers.get('link');
            nextUrl = null;
            if (linkHeader) {
                const links = linkHeader.split(',');
                const nextLinkStr = links.find(l => l.includes('rel="next"'));
                if (nextLinkStr) {
                    nextUrl = nextLinkStr.match(/<(.*?)>/)[1];
                }
            }
        }
        return results;
    }
});