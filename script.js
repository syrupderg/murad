const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const modList = document.getElementById('mod-list');
const versionSelector = document.getElementById('version-selector');

let selectedLoader = "fabric";
let selectedTargetVersions = ["26.1.2"];

let scannedMods = [];
let mcVersionsCache = [];

let currentSortMode = "COMP";
let nameSortDir = 1;
let compSortDir = 1;
let catSortDirs = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
let searchQuery = "";

let pendingOverrideDataStr = "";
let projectNameCache = {}; // Cache to store Modrinth project names

const PRIORITY = { GREEN: 1, YELLOW: 2, RED: 3, NOT_FOUND: 4, CHECKING: 5 };
const PRIORITY_NAMES = {
    1: "Compatible", 2: "Kinda Compatible", 3: "Incompatible",
    4: "Not Found", 5: "Checking / Errors"
};

const VERSION_GROUPS = [
    { name: "26.1.2-26.1", versions: ["26.1.2", "26.1.1", "26.1"] },
    { name: "1.21.11", versions: ["1.21.11"] },
    { name: "1.21.10-1.21.9", versions: ["1.21.10", "1.21.9"] },
    { name: "1.21.8-1.21.7", versions: ["1.21.8", "1.21.7"] },
    { name: "1.21.6", versions: ["1.21.6"] },
    { name: "1.21.5", versions: ["1.21.5"] },
    { name: "1.21.4", versions: ["1.21.4"] },
    { name: "1.21.3-1.21.2", versions: ["1.21.3", "1.21.2"] },
    { name: "1.21.1-1.21", versions: ["1.21.1", "1.21"] },
    { name: "1.20.6-1.20.5", versions: ["1.20.6", "1.20.5"] },
    { name: "1.20.4-1.20.3", versions: ["1.20.4", "1.20.3"] },
    { name: "1.20.2", versions: ["1.20.2"] },
    { name: "1.20.1-1.20", versions: ["1.20.1", "1.20"] }
];

const LOADER_FILES = {
    fabric: 'icons/fabric.svg',
    quilt: 'icons/quilt.svg',
    forge: 'icons/forge.svg',
    neoforge: 'icons/neoforge.svg'
};

const TINY_LOADER_FILES = {
    fabric: 'icons/fabric-tiny.svg',
    quilt: 'icons/quilt-tiny.svg',
    forge: 'icons/forge-tiny.svg',
    neoforge: 'icons/neoforge-tiny.svg'
};

const LOADER_COLORS = {
    fabric: '#dbb69b',
    quilt: '#c796f9',
    neoforge: '#f99e6b',
    forge: '#959eef'
};

const LOADER_SORT_ORDER = {
    fabric: 1,
    quilt: 2,
    neoforge: 3,
    forge: 4
};

function isValidRelease(v) { return /^\d+\.\d+(\.\d+)?$/.test(v); }

function parseVersion(v) {
    let parts = v.split('.').map(Number);
    return { original: v, maj: parts[0] || 0, min: parts[1] || 0, pat: parts[2] || 0 };
}

function isAtLeast1_20(v) {
    let p = parseVersion(v);
    if (p.maj > 1) return true;
    if (p.maj === 1 && p.min >= 20) return true;
    return false;
}

function timeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval > 1) return interval + " years ago";
    if (interval === 1) return "last year";
    interval = Math.floor(seconds / 2592000);
    if (interval > 1) return interval + " months ago";
    if (interval === 1) return "last month";
    interval = Math.floor(seconds / 86400);
    if (interval > 1) return interval + " days ago";
    if (interval === 1) return "yesterday";
    interval = Math.floor(seconds / 3600);
    if (interval > 1) return interval + " hours ago";
    if (interval === 1) return "1 hour ago";
    interval = Math.floor(seconds / 60);
    if (interval > 1) return interval + " minutes ago";
    if (interval === 1) return "1 minute ago";
    return "just now";
}

async function getFileHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadMcVersions() {
    const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
    const data = await res.json();
    mcVersionsCache = data.filter(v => v.version_type === 'release' && isValidRelease(v.version) && isAtLeast1_20(v.version));
    mcVersionsCache.sort((a, b) => {
        let pA = parseVersion(a.version), pB = parseVersion(b.version);
        if (pB.maj !== pA.maj) return pB.maj - pA.maj;
        if (pB.min !== pA.min) return pB.min - pA.min;
        return pB.pat - pA.pat;
    });
    mcVersionsCache = mcVersionsCache.slice(0, 50);
    renderSidebar();
}

window.setLoader = (loader) => {
    selectedLoader = loader;
    document.getElementById('btn-ldr-fabric').classList.toggle('active', loader === 'fabric');
    document.getElementById('btn-ldr-quilt').classList.toggle('active', loader === 'quilt');
    document.getElementById('btn-ldr-neoforge').classList.toggle('active', loader === 'neoforge');
    document.getElementById('btn-ldr-forge').classList.toggle('active', loader === 'forge');
    setTimeout(() => { evaluateAllMods(); }, 10);
};

window.setVersion = (version) => {
    selectedTargetVersions = [version];
    setTimeout(() => { evaluateAllMods(); }, 10);
};

window.handleSearch = (e) => {
    searchQuery = e.target.value.toLowerCase();
    setTimeout(() => { renderAll(); }, 10);
};

window.toggleDetails = (modId) => {
    const details = document.getElementById(`details-${modId}`);
    const iconBtn = document.getElementById(`btn-expand-${modId}`);
    if (details.classList.contains('expanded')) {
        details.classList.remove('expanded');
        iconBtn.classList.remove('expanded');
    } else {
        details.classList.add('expanded');
        iconBtn.classList.add('expanded');
    }
};

window.downloadOverrideFile = () => {
    if (!pendingOverrideDataStr) return;
    const downloadNode = document.createElement('a');
    downloadNode.setAttribute("href", pendingOverrideDataStr);
    downloadNode.setAttribute("download", "fabric_loader_dependencies.json");
    document.body.appendChild(downloadNode);
    downloadNode.click();
    downloadNode.remove();
};

window.downloadModPack = async (format) => {
    const excludeKinda = document.getElementById('exclude-kinda-checkbox')?.checked;
    const filteredList = scannedMods.filter(m => m.name.toLowerCase().includes(searchQuery));
    const validMods = filteredList.filter(m => {
        if (!m.matchedRelease) return false;
        if (m.priority === 1) return true;
        if (m.priority === 2 && !excludeKinda) return true;
        return false;
    });

    if (validMods.length === 0) return;

    const btnZip = document.getElementById('btn-download-zip');
    const btnMrpack = document.getElementById('btn-download-mrpack');
    const progressBar = document.getElementById('download-progress-bar');
    const statusText = document.getElementById('download-status-text');

    if(btnZip) btnZip.disabled = true;
    if(btnMrpack) btnMrpack.disabled = true;
    progressBar.style.width = '0%';

    const zip = new JSZip();

    if (format === 'mrpack') {
        statusText.innerText = "Building Modrinth Modpack Metadata (.mrpack)...";
        progressBar.style.width = '50%';
        const safeLoader = selectedLoader === 'neoforge' ? 'neo-forge' : selectedLoader;
        const indexJson = {
            formatVersion: 1, game: "minecraft", versionId: selectedTargetVersions[0],
            name: `MURAD ${capitalize(selectedLoader)} Pack`,
            dependencies: { minecraft: selectedTargetVersions[0] }, files: []
        };
        indexJson.dependencies[safeLoader] = "*";

        for (const mod of validMods) {
            const rel = mod.matchedRelease;
            const primaryFile = rel.files.find(f => f.primary) || rel.files[0];
            if (primaryFile && primaryFile.hashes) {
                indexJson.files.push({
                    path: `mods/${primaryFile.filename}`, hashes: primaryFile.hashes,
                    downloads: [primaryFile.url], fileSize: primaryFile.size
                });
            }
        }
        zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 4));
        progressBar.style.width = '100%';

        zip.generateAsync({ type: "blob" }).then(function(content) {
            const downloadNode = document.createElement('a');
            downloadNode.href = URL.createObjectURL(content);
            downloadNode.download = `murad_pack_${selectedLoader}_${selectedTargetVersions[0]}.mrpack`;
            document.body.appendChild(downloadNode); downloadNode.click(); document.body.removeChild(downloadNode);
            statusText.innerText = "Download complete!";
            setTimeout(() => {
                if(btnZip) btnZip.disabled = false; if(btnMrpack) btnMrpack.disabled = false;
                progressBar.style.width = '0%'; statusText.innerText = "Waiting to download...";
            }, 3000);
        });

    } else {
        let completed = 0;
        for (const mod of validMods) {
            const rel = mod.matchedRelease;
            const primaryFile = rel.files.find(f => f.primary) || rel.files[0];
            if (primaryFile) {
                statusText.innerText = `Downloading ${primaryFile.filename}...`;
                try {
                    const response = await fetch(primaryFile.url);
                    if (response.ok) {
                        const blob = await response.blob();
                        zip.file(primaryFile.filename, blob);
                    }
                } catch (e) { console.error(`Failed to download ${primaryFile.filename}`, e); }
            }
            completed++;
            progressBar.style.width = `${(completed / validMods.length) * 100}%`;
        }

        statusText.innerText = "Building ZIP archive... This may take a moment.";
        zip.generateAsync({ type: "blob" }).then(function(content) {
            const downloadNode = document.createElement('a');
            downloadNode.href = URL.createObjectURL(content);
            downloadNode.download = `murad_pack_${selectedLoader}_${selectedTargetVersions[0]}.zip`;
            document.body.appendChild(downloadNode); downloadNode.click(); document.body.removeChild(downloadNode);
            statusText.innerText = "Download complete!";
            setTimeout(() => {
                if(btnZip) btnZip.disabled = false; if(btnMrpack) btnMrpack.disabled = false;
                progressBar.style.width = '0%'; statusText.innerText = "Waiting to download...";
            }, 3000);
        });
    }
};

function renderSidebar() {
    const totalValidMods = scannedMods.filter(m => m.apiData && m.apiData !== "ERROR").length;
    let html = ""; let renderedVersions = new Set();
    mcVersionsCache.forEach(cacheVer => {
        if (renderedVersions.has(cacheVer.version)) return;
        let group = VERSION_GROUPS.find(g => g.versions.includes(cacheVer.version));
        if (group) {
            html += `<div class="v-group-title">${group.name}</div>`;
            let groupVersionsInCache = group.versions.filter(gv => mcVersionsCache.some(c => c.version === gv));
            groupVersionsInCache.sort((a, b) => {
                let pA = parseVersion(a), pB = parseVersion(b);
                if (pB.maj !== pA.maj) return pB.maj - pA.maj;
                if (pB.min !== pA.min) return pB.min - pA.min;
                return pB.pat - pA.pat;
            });
            groupVersionsInCache.forEach(gv => { renderedVersions.add(gv); html += generateSidebarButton(gv, totalValidMods); });
        } else {
            html += `<div class="v-group-title">${cacheVer.version}</div>`;
            renderedVersions.add(cacheVer.version);
            html += generateSidebarButton(cacheVer.version, totalValidMods);
        }
    });
    versionSelector.innerHTML = html;
}

function generateSidebarButton(versionName, totalValidMods) {
    let compCount = 0;
    if (totalValidMods > 0) {
        compCount = scannedMods.filter(m => {
            if (!m.apiData || m.apiData === "ERROR") return false;
            let filteredData = m.apiData.filter(release => release.loaders.includes(selectedLoader));
            return filteredData.some(release => release.game_versions.includes(versionName));
        }).length;
    }
    const pct = totalValidMods > 0 ? Math.round((compCount / totalValidMods) * 100) : 0;
    let pctHtml = '';
    if (totalValidMods > 0) {
        let pctClass = '', emoji = '';
        if (pct === 100) { pctClass = 'pct-green'; emoji = '⭐'; }
        else if (pct >= 75) { pctClass = 'pct-green'; }
        else if (pct >= 50) { pctClass = 'pct-yellow'; }
        else if (pct >= 25) { pctClass = 'pct-orange'; }
        else if (pct > 0) { pctClass = 'pct-red'; }
        else { pctClass = 'pct-red'; emoji = '💀'; }
        pctHtml = `<span class="pct ${pctClass}">${pct}% ${emoji}</span>`;
    }
    const isActive = selectedTargetVersions[0] === versionName;
    return `
        <button class="v-btn ${isActive ? 'active' : ''}" onclick="setVersion('${versionName}')">
            <span>${versionName}</span> ${pctHtml}
        </button>
    `;
}

window.toggleSort = (mode) => {
    if (currentSortMode === mode) {
        if (mode === 'NAME') nameSortDir *= -1;
        if (mode === 'COMP') compSortDir *= -1;
    } else currentSortMode = mode;
    setTimeout(() => { renderAll(); }, 10);
};

window.toggleCatSort = (priority) => {
    catSortDirs[priority] *= -1;
    setTimeout(() => { renderAll(); }, 10);
};

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
    const fetchPromises = [];
    for (const file of files) {
        if (file.name.endsWith('.jar')) {
            const hash = await getFileHash(file);
            const modData = await parseJar(file);
            if (modData) {
                modData.fileHash = hash;
                if (!scannedMods.find(m => m.fileHash === hash)) {
                    modData.priority = PRIORITY.CHECKING;
                    modData.statusHtml = `Fetching API...`;
                    modData.apiData = null; modData.matchedRelease = null;
                    scannedMods.push(modData);
                    fetchPromises.push(fetchModData(modData));
                }
            } else {
                scannedMods.push({
                    id: file.name, name: file.name, version: "N/A", priority: PRIORITY.CHECKING,
                    statusHtml: `<span class="badge red">Read Error</span>`, apiData: "ERROR"
                });
            }
        }
        else if (file.name.endsWith('.mrpack')) {
            const zip = new JSZip();
            try {
                const contents = await zip.loadAsync(file);
                const indexFile = contents.file("modrinth.index.json");
                if (indexFile) {
                    const rawData = await indexFile.async("string");
                    const indexJson = JSON.parse(rawData);
                    for (const modFile of indexJson.files) {
                        const sha1 = modFile.hashes.sha1;
                        const filename = modFile.path.split('/').pop() || "Unknown File";
                        if (!scannedMods.find(m => m.fileHash === sha1)) {
                            const modData = {
                                id: sha1, name: filename, version: "mrpack", fileHash: sha1,
                                priority: PRIORITY.CHECKING, statusHtml: `Fetching API...`, apiData: null, matchedRelease: null
                            };
                            scannedMods.push(modData);
                            fetchPromises.push(fetchModData(modData));
                        }
                    }
                }
            } catch (e) { console.warn(`Failed to parse mrpack ${file.name}:`, e); }
        }
    }
    renderAll();
    await Promise.all(fetchPromises);
    await evaluateAllMods();
}

async function parseJar(file) {
    const zip = new JSZip();
    try {
        const contents = await zip.loadAsync(file);
        const fabricJson = contents.file("fabric.mod.json");
        if (fabricJson) {
            const rawData = await fabricJson.async("string");
            const json = JSON.parse(rawData.replace(/[\x00-\x1F]/g, ""));
            // Removed local fallback dependency checking here
            return { id: json.id, name: json.name || json.id, version: json.version };
        }
    } catch (e) { console.warn(`Parse error:`, e); }
    return null;
}

async function fetchModData(mod) {
    try {
        let hashRes = await fetch(`https://api.modrinth.com/v2/version_file/${mod.fileHash}?algorithm=sha1`);
        if (hashRes.ok) {
            const hashData = await hashRes.json();
            if (mod.version === "mrpack") {
                mod.version = hashData.version_number;
                try {
                    const projRes = await fetch(`https://api.modrinth.com/v2/project/${hashData.project_id}`);
                    if (projRes.ok) {
                        const projData = await projRes.json();
                        mod.name = projData.title; mod.id = projData.slug;
                    }
                } catch(e) {}
            }
            const allRes = await fetch(`https://api.modrinth.com/v2/project/${hashData.project_id}/version`);
            mod.apiData = await allRes.json();
            return;
        }

        let projectId = mod.id;
        let projectRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);

        if (!projectRes.ok) {
            const searchRes = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(mod.name)}&limit=5`);
            const searchData = await searchRes.json();
            const exactHit = searchData.hits.find(hit => hit.slug.toLowerCase() === mod.id.toLowerCase() || hit.title.toLowerCase() === mod.name.toLowerCase());
            if (exactHit) { projectId = exactHit.project_id; } else { throw new Error("Strict match not found"); }
        }
        const allRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
        mod.apiData = await allRes.json();
    } catch (e) { mod.apiData = "ERROR"; }
}

function getLoaderVersionRanges(apiData) {
    if (!apiData || apiData === "ERROR" || apiData.length === 0) return {};
    let loaderVersions = { fabric: new Set(), quilt: new Set(), forge: new Set(), neoforge: new Set() };
    apiData.forEach(release => {
        release.loaders.forEach(l => {
            if (loaderVersions[l]) {
                release.game_versions.forEach(v => {
                    if(isValidRelease(v) && isAtLeast1_20(v)) loaderVersions[l].add(v);
                });
            }
        });
    });
    let ranges = {};
    for (let l in loaderVersions) {
        if (loaderVersions[l].size > 0) {
            let parsed = Array.from(loaderVersions[l]).map(parseVersion);
            let groups = {};
            parsed.forEach(p => { let key = `${p.maj}.${p.min}`; if (!groups[key]) groups[key] = []; groups[key].push(p); });
            let allRanges = [];
            for (let key in groups) {
                let sorted = groups[key].sort((a, b) => a.pat - b.pat);
                let start = sorted[0], prev = sorted[0];
                for (let i = 1; i < sorted.length; i++) {
                    let curr = sorted[i];
                    if (curr.pat === prev.pat + 1) { prev = curr; }
                    else { allRanges.push(start.original === prev.original ? start.original : `${start.original}–${prev.original}`); start = curr; prev = curr; }
                }
                allRanges.push(start.original === prev.original ? start.original : `${start.original}–${prev.original}`);
            }
            allRanges.sort((a, b) => {
                let pA = parseVersion(a.split('–')[0]), pB = parseVersion(b.split('–')[0]);
                if (pA.maj !== pB.maj) return pA.maj - pB.maj;
                if (pA.min !== pB.min) return pA.min - pB.min;
                return pA.pat - pB.pat;
            });
            ranges[l] = allRanges;
        }
    }
    return ranges;
}

function getHighestVersion(versionsArray) {
    if (!versionsArray || versionsArray.length === 0) return null;
    return versionsArray.sort((a, b) => {
        let pA = a.split('.').map(Number), pB = b.split('.').map(Number);
        for(let i = 0; i < Math.max(pA.length, pB.length); i++) {
            let nA = pA[i] || 0, nB = pB[i] || 0;
            if (nA !== nB) return nB - nA;
        }
        return 0;
    })[0];
}

function getGroupForVersion(v) {
    for (let g of VERSION_GROUPS) { if (g.versions.includes(v)) return g.versions; }
    return [v];
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

async function evaluateAllMods() {
    scannedMods.forEach(mod => {
        if (mod.apiData === "ERROR") {
            mod.priority = PRIORITY.NOT_FOUND;
            mod.statusHtml = `<span class="badge red">Not on Modrinth / Error</span>`;
            mod.matchedRelease = null;
            return;
        }
        if (!mod.apiData) return;

        let filteredData = mod.apiData.filter(release => release.loaders.includes(selectedLoader));
        const targetVersion = selectedTargetVersions[0];
        const exactMatch = filteredData.find(release => release.game_versions.includes(targetVersion));

        if (exactMatch) {
            mod.priority = PRIORITY.GREEN; mod.statusHtml = `<span class="badge green">Compatible: ${exactMatch.version_number}</span>`; mod.matchedRelease = exactMatch;
        } else if (filteredData.length > 0) {
            let allGameVersions = new Set();
            filteredData.forEach(release => {
                release.game_versions.forEach(v => { if(isValidRelease(v) && isAtLeast1_20(v)) allGameVersions.add(v); });
            });

            const targetGroup = getGroupForVersion(targetVersion);
            const validSpoofVersions = Array.from(allGameVersions).filter(v => targetGroup.includes(v));
            const latestMc = getHighestVersion(Array.from(allGameVersions)) || "Unknown";

            if (validSpoofVersions.length > 0) {
                const spoofAs = getHighestVersion(validSpoofVersions);
                mod.priority = PRIORITY.YELLOW; mod.matchedRelease = filteredData.find(r => r.game_versions.includes(spoofAs));
                const modVersion = mod.matchedRelease ? mod.matchedRelease.version_number : spoofAs;
                mod.statusHtml = `
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <span class="badge yellow" style="white-space: normal; max-width: 182px; text-align: center;">
                            <a>Kinda Compatible: ${modVersion}</a> <br><br>
                            This mod supports <u>${latestMc}</u>, but it can work with <u>${targetVersion}</u> after some tweaking.
                        </span>
                    </div>`;
            } else {
                mod.priority = PRIORITY.RED; mod.statusHtml = `<span class="badge red">${targetVersion} is not supported</span>`; mod.matchedRelease = filteredData[0];
            }
        } else { mod.priority = PRIORITY.RED; mod.statusHtml = `<span class="badge red">No ${capitalize(selectedLoader)} releases</span>`; mod.matchedRelease = null; }
    });

    let depsToFetch = new Set();
    scannedMods.forEach(mod => {
        if (mod.matchedRelease && mod.matchedRelease.dependencies) {
            mod.matchedRelease.dependencies.forEach(d => {
                if (d.project_id && !projectNameCache[d.project_id]) { depsToFetch.add(d.project_id); }
            });
        }
    });

    if (depsToFetch.size > 0) {
        const idsArray = Array.from(depsToFetch);
        for (let i = 0; i < idsArray.length; i += 100) {
            const chunk = idsArray.slice(i, i + 100);
            try {
                const res = await fetch(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`);
                if (res.ok) {
                    const projects = await res.json();
                    projects.forEach(p => { projectNameCache[p.id] = p.title || p.slug; });
                }
            } catch (e) { console.error("Failed to fetch dependency project names", e); }
        }
    }

    renderSidebar();
    renderAll();
}

function updateOverrideBar(list) {
    const overrideBar = document.getElementById('override-bar');
    if (!overrideBar) return;
    const countEl = document.getElementById('override-count');
    const kindaCompMods = list.filter(m => m.priority === 2 && m.name.toLowerCase().includes(searchQuery));
    if (kindaCompMods.length > 0 && (selectedLoader === 'fabric' || selectedLoader === 'quilt')) {
        overrideBar.style.display = 'flex'; countEl.innerText = kindaCompMods.length;
        const overrides = {};
        kindaCompMods.forEach(mod => { overrides[mod.id] = { "-depends": { "minecraft": "IGNORED" } }; });
        const jsonString = JSON.stringify({ version: 1, overrides: overrides }, null, 4);
        document.getElementById('override-json-preview').innerText = jsonString;
        pendingOverrideDataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);
    } else { overrideBar.style.display = 'none'; }
}

function updateDownloadPackBar(list) {
    const downloadBar = document.getElementById('download-pack-bar');
    if (!downloadBar) return;
    const excludeKinda = document.getElementById('exclude-kinda-checkbox')?.checked || false;
    let validMods = list.filter(m => {
        if (m.priority === 1) return true;
        if (m.priority === 2 && !excludeKinda) return true;
        return false;
    });
    const incompatibleMods = list.filter(m => m.priority === 3);

    if (validMods.length > 0) {
        downloadBar.style.display = 'flex';
        document.getElementById('pack-count').innerText = validMods.length;
        document.getElementById('pack-version').innerText = selectedTargetVersions[0];
        const warningEl = document.getElementById('pack-warning');
        if (incompatibleMods.length > 0) { warningEl.style.display = 'inline-flex'; document.getElementById('incompatible-count').innerText = incompatibleMods.length; } 
        else { warningEl.style.display = 'none'; }
        validMods.sort((a, b) => a.name.localeCompare(b.name));
        document.getElementById('pack-mod-list').innerHTML = validMods.map(m => `
            <div class="pack-mod-item">
                <span>${m.name}</span>
                <span style="color: #9aa0a6;">${m.matchedRelease ? m.matchedRelease.version_number : "Unknown"}</span>
            </div>
        `).join('');
    } else { downloadBar.style.display = 'none'; }
}

function updateStatsUI(list) {
    const statsContainer = document.getElementById('detailed-stats');
    const depsStatsContainer = document.getElementById('detailed-stats-deps');

    if (list.length === 0) { 
        statsContainer.style.display = 'none'; 
        depsStatsContainer.style.display = 'none';
        return; 
    }

    // --- Main Mod Stats ---
    statsContainer.style.display = 'flex';
    statsContainer.innerHTML = `
        <span class="stat-total">Total Mods: ${list.length}</span>
        <span class="stat-green">${list.filter(m => m.priority === 1).length} Compatible</span>
        <span class="stat-yellow">${list.filter(m => m.priority === 2).length} Kinda Compatible</span>
        <span class="stat-red">${list.filter(m => m.priority === 3).length} Incompatible</span>
        <span class="stat-gray">${list.filter(m => m.priority === 4 || m.priority === 5).length} Not Found</span>
    `;

    // --- Unique Dependency Stats (using Sets to filter duplicates) ---
    let uniqueReq = new Set();
    let uniqueOpt = new Set();
    let uniqueInc = new Set();

    list.forEach(mod => {
        if (mod.matchedRelease && mod.matchedRelease.dependencies) {
            mod.matchedRelease.dependencies.forEach(d => {
                if (!d.project_id) return; 
                
                if (d.dependency_type === 'required') uniqueReq.add(d.project_id);
                else if (d.dependency_type === 'optional') uniqueOpt.add(d.project_id);
                else if (d.dependency_type === 'incompatible') uniqueInc.add(d.project_id);
            });
        }
    });

    const totalReq = uniqueReq.size;
    const totalOpt = uniqueOpt.size;
    const totalInc = uniqueInc.size;

    // --- NEW: Calculate Missing Required Dependencies ---
    let missingReqCount = 0;
    uniqueReq.forEach(reqId => {
        const name = projectNameCache[reqId] || reqId;
        const isLoaded = scannedMods.some(m => 
            (m.matchedRelease && m.matchedRelease.project_id === reqId) || 
            m.id === reqId ||
            m.id === name
        );
        if (!isLoaded) {
            missingReqCount++;
        }
    });

    // Format the text so it only shows "(n Missing)" if there are actually missing dependencies
    const reqText = missingReqCount > 0 
        ? `${totalReq} Required (${missingReqCount} Missing)` 
        : `${totalReq} Required`;

    // Only show the dependency stats bar if there are actually dependencies to report
    if (totalReq > 0 || totalOpt > 0 || totalInc > 0) {
        depsStatsContainer.style.display = 'flex';
        depsStatsContainer.innerHTML = `
            <span class="stat-total">Unique Dependencies: ${totalReq + totalOpt + totalInc}</span>
            <span style="color: #ff9800; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 14px;">error</span> ${reqText}
            </span>
            <span style="color: #448aff; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 14px;">lightbulb_2</span> ${totalOpt} Suggested
            </span>
            <span style="color: #ff5252; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 14px;">dangerous</span> ${totalInc} Incompatible
            </span>
        `;
    } else {
        depsStatsContainer.style.display = 'none';
    }
}

function renderAll() {
    let displayList = scannedMods.filter(mod => mod.name.toLowerCase().includes(searchQuery));
    updateStatsUI(displayList); updateOverrideBar(scannedMods); updateDownloadPackBar(displayList);

    const btnName = document.getElementById('btn-sort-name'), btnComp = document.getElementById('btn-sort-comp');
    btnName.className = `sort-btn ${currentSortMode === 'NAME' ? 'active' : ''}`; btnName.innerText = `Name: ${nameSortDir === 1 ? 'A-Z' : 'Z-A'}`;
    btnComp.className = `sort-btn ${currentSortMode === 'COMP' ? 'active' : ''}`; btnComp.innerText = `Compatibility: ${compSortDir === 1 ? 'Best to Worst' : 'Worst to Best'}`;

    let htmlBuilder = "";
    if (currentSortMode === 'NAME') {
        displayList.sort((a, b) => a.name.localeCompare(b.name) * nameSortDir);
        displayList.forEach(mod => { htmlBuilder += generateModHTML(mod); });
    } else if (currentSortMode === 'COMP') {
        const priorities = compSortDir === 1 ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
        priorities.forEach(p => {
            let group = displayList.filter(m => m.priority === p);
            if (group.length > 0) {
                let catDir = catSortDirs[p];
                group.sort((a, b) => a.name.localeCompare(b.name) * catDir);
                htmlBuilder += `
                    <div class="category-header">
                        <span>${PRIORITY_NAMES[p]} (${group.length})</span>
                        <button class="cat-sort-btn" onclick="toggleCatSort(${p})">${catDir === 1 ? 'A-Z' : 'Z-A'}</button>
                    </div>`;
                group.forEach(mod => { htmlBuilder += generateModHTML(mod); });
            }
        });
    }
    modList.innerHTML = htmlBuilder;
}

function generateModHTML(mod) {
    let rangesHtml = '<span class="range-text">Loading...</span>';
    let detailsHtml = '';
    
    // --- DEPENDENCY PROCESSING (API Only) ---
    let hasRequiredDeps = false;
    let hasOptionalDeps = false;
    let hasIncompatibleDeps = false;
    let depsHtml = '';

    // Variables to track if the dependencies are currently loaded in the workspace
    let allReqLoaded = false;
    let anyOptLoaded = false;
    let anyIncLoaded = false;

    if (mod.matchedRelease && mod.matchedRelease.dependencies && mod.matchedRelease.dependencies.length > 0) {
        const deps = mod.matchedRelease.dependencies;
        const reqDeps = deps.filter(d => d.dependency_type === 'required');
        const optDeps = deps.filter(d => d.dependency_type === 'optional');
        const incDeps = deps.filter(d => d.dependency_type === 'incompatible');
        
        // Helper function to check if a specific dependency is loaded in MURAD
        const isDepLoaded = (d) => {
            if (!d.project_id) return false;
            const name = projectNameCache[d.project_id] || d.project_id;
            return scannedMods.some(m => 
                (m.matchedRelease && m.matchedRelease.project_id === d.project_id) || 
                m.id === d.project_id ||
                m.id === name
            );
        };

        if (reqDeps.length > 0) {
            hasRequiredDeps = true;
            allReqLoaded = reqDeps.every(isDepLoaded); // MUST have all required
        }
        if (optDeps.length > 0) {
            hasOptionalDeps = true;
            anyOptLoaded = optDeps.some(isDepLoaded); // Only need at least one suggested
        }
        if (incDeps.length > 0) {
            hasIncompatibleDeps = true;
            anyIncLoaded = incDeps.some(isDepLoaded); // Bad if ANY incompatible is loaded
        }

        const formatApiDeps = (depList, type, color, icon) => {
            if (depList.length === 0) return '';
            
            const extraStyle = type === 'Incompatible' ? 'width: 113px;' : '';

            return `
                <div class="dep-group">
                    <span class="dep-type" style="color: ${color}; display: flex; align-items: center; gap: 4px; ${extraStyle}">
                        <span class="material-symbols-outlined" style="font-size: 20px;">${icon}</span>
                        ${type}:
                    </span>
                    <div class="dep-list">
                        ${depList.map(d => {
                            if (!d.project_id) return ''; 
                            const name = projectNameCache[d.project_id] || d.project_id;
                            
                            const isLoaded = isDepLoaded(d);
                            
                            // Visuals for badges: Green tick for normal, Red warning for incompatible
                            const loadedIconType = (type === 'Incompatible') ? 'warning' : 'check_circle';
                            const loadedIconColor = (type === 'Incompatible') ? '#ff5252' : '#1BD96A';
                            
                            const loadedIcon = isLoaded ? `<span class="material-symbols-outlined" style="font-size: 14px; margin-left: 4px; color: ${loadedIconColor};" title="Already loaded in MURAD">${loadedIconType}</span>` : '';
                            
                            let loadedStyle = '';
                            if (isLoaded) {
                                loadedStyle = (type === 'Incompatible') 
                                    ? `border-color: rgba(255, 82, 82, 0.4); background: rgba(255, 82, 82, 0.1);`
                                    : `border-color: rgba(27, 217, 106, 0.4); background: rgba(27, 217, 106, 0.1);`;
                            }
                            
                            const tooltipText = isLoaded ? `Already loaded in MURAD!` : `View on Modrinth`;

                            return `<a href="https://modrinth.com/mod/${d.project_id}" target="_blank" class="dep-badge clickable-dep" title="${tooltipText}" style="text-decoration:none; ${loadedStyle}">
                                ${name}${loadedIcon}
                            </a>`;
                        }).join('')}
                    </div>
                </div>
            `;
        };
        const reqHtml = formatApiDeps(reqDeps, 'Required', '#ff9800', 'error');
        const optHtml = formatApiDeps(optDeps, 'Optional', '#448aff', 'lightbulb_2');
        const incHtml = formatApiDeps(incDeps, 'Incompatible', '#ff5252', 'dangerous');
        
        if (reqHtml || optHtml || incHtml) {
            depsHtml = `
                <div class="dependencies-container">
                    <span class="detail-label" style="display:dangerous; margin-bottom: 8px;">Dependencies</span>
                    ${reqHtml}${optHtml}${incHtml}
                </div>
            `;
        }
    }
    // ---------------------------------

    if (mod.apiData && mod.apiData !== "ERROR") {
        const loaderRanges = getLoaderVersionRanges(mod.apiData);
        const loaders = Object.keys(loaderRanges).sort((a, b) => LOADER_SORT_ORDER[a] - LOADER_SORT_ORDER[b]);
        if (loaders.length > 0) {
            rangesHtml = loaders.map(l => `
                <div class="loader-range-row">
                    <img src="${LOADER_FILES[l]}" alt="${capitalize(l)}" class="loader-img" title="${capitalize(l)}">
                    <span class="loader-name-text"><strong>${capitalize(l)}:</strong></span>
                    <div class="range-badges">
                        ${loaderRanges[l].map(rangeText => `<span class="version-badge">${rangeText}</span>`).join('')}
                    </div>
                </div>
            `).join('');
        } else { rangesHtml = '<span class="range-text">No supported versions >= 1.20 found.</span>'; }

        if (mod.matchedRelease) {
            const rel = mod.matchedRelease;
            const typeLetter = rel.version_type.charAt(0).toUpperCase();
            const typeClass = `type-${rel.version_type}`;
            const highestGV = getHighestVersion([...rel.game_versions]) || rel.game_versions[0];
            const platformHtml = rel.loaders.map(l => {
                const color = LOADER_COLORS[l] || '#e0e0e0';
                const icon = TINY_LOADER_FILES[l] || '';
                return `
                    <span class="platform-tag" style="color: ${color};">
                        <span class="platform-icon" style="-webkit-mask: url(${icon}) no-repeat center / contain; mask: url(${icon}) no-repeat center / contain; background-color: ${color};"></span>
                        ${capitalize(l)}
                    </span>
                `;
            }).join('');
            const dateObj = new Date(rel.date_published);
            const dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const timeAgoStr = timeAgo(rel.date_published);
            const dlStr = rel.downloads.toLocaleString();
            const primaryFile = rel.files.find(f => f.primary) || rel.files[0];
            const directDownloadUrl = primaryFile ? primaryFile.url : '#';

            detailsHtml = `
                <div class="details-top-row">
                    <div class="details-left">
                        <span class="release-type-badge ${typeClass}" title="${capitalize(rel.version_type)}">${typeLetter}</span>
                        <div class="detail-col">
                            <span class="detail-label">Name</span>
                            <span class="detail-val">${rel.version_number}<br><span style="font-size: 0.75rem; color: #9aa0a6;">${rel.name}</span></span>
                        </div>
                        <div class="detail-col">
                            <span class="detail-label">Game version:</span>
                            <span class="detail-val">${highestGV}</span>
                        </div>
                        <div class="detail-col">
                            <span class="detail-label">Platform:</span>
                            <span class="detail-val">${platformHtml}</span>
                        </div>
                        <div class="detail-col">
                            <span class="detail-label">Published</span>
                            <span class="detail-val">${dateStr} <span style="color: #9aa0a6;">(${timeAgoStr})</span></span>
                        </div>
                        <div class="detail-col">
                            <span class="detail-label">Downloads:</span>
                            <span class="detail-val">${dlStr}</span>
                        </div>
                    </div>
                    <div class="details-right">
                        <a href="${directDownloadUrl}" class="download-btn">
                            <span class="material-symbols-outlined" style="font-size: 18px;">download</span> Download
                        </a>
                        <a href="https://modrinth.com/mod/${rel.project_id}/version/${rel.id}" target="_blank" class="download-btn" style="background: rgba(255, 255, 255, 0.1); color: #e0e0e0;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">open_in_new</span>
                        </a>
                    </div>
                </div>
                ${depsHtml}
            `;
        } else { detailsHtml = `<div style="width: 100%; text-align: center; color: #9aa0a6;">No matching version found on Modrinth.</div>`; }
    } else if (mod.apiData === "ERROR") {
        rangesHtml = '<span class="range-text">N/A</span>';
        detailsHtml = `<div style="width: 100%; text-align: center; color: #9aa0a6;">Error connecting to Modrinth API.</div>`;
    }

    const safeId = mod.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // --- Generate Main Dependency Status Icons ---
    let depIconsHtml = '';
    
    if (hasRequiredDeps) {
        // NEW: Apply a green background badge if all required are loaded
        const bgStyle = allReqLoaded ? `background: rgba(27, 217, 106, 0.1); border: 1px solid rgba(27, 217, 106, 0.4); padding: 2px 6px; border-radius: 8px;` : `padding: 2px 0;`;
        const tick = allReqLoaded ? `<span class="material-symbols-outlined" style="font-size: 20px; color: #1BD96A; margin-left: 2px;">check_circle</span>` : '';
        
        depIconsHtml += `<div style="display: flex; align-items: center; cursor: help; ${bgStyle}" title="${allReqLoaded ? 'All required mods loaded!' : 'Requires other mods'}"><span class="material-symbols-outlined" style="font-size: 20px; color: #ff9800;">error</span>${tick}</div>`;
    }
    
    if (hasOptionalDeps) {
        // NEW: Apply a green background badge if any suggested are loaded
        const bgStyle = anyOptLoaded ? `background: rgba(27, 217, 106, 0.1); border: 1px solid rgba(27, 217, 106, 0.4); padding: 2px 6px; border-radius: 8px;` : `padding: 2px 0;`;
        const tick = anyOptLoaded ? `<span class="material-symbols-outlined" style="font-size: 20px; color: #1BD96A; margin-left: 2px;">check_circle</span>` : '';
        
        depIconsHtml += `<div style="display: flex; align-items: center; cursor: help; ${bgStyle}" title="${anyOptLoaded ? 'Suggested mod(s) loaded!' : 'Has suggested mods'}"><span class="material-symbols-outlined" style="font-size: 20px; color: #448aff;">lightbulb_2</span>${tick}</div>`;
    }
    
    if (hasIncompatibleDeps) {
        // NEW: Apply a red background badge if an incompatible mod is loaded!
        const bgStyle = anyIncLoaded ? `background: rgba(255, 82, 82, 0.1); border: 1px solid rgba(255, 82, 82, 0.4); padding: 2px 6px; border-radius: 8px;` : `padding: 2px 0;`;
        const warn = anyIncLoaded ? `<span class="material-symbols-outlined" style="font-size: 20px; color: #ff5252; margin-left: 2px;">warning</span>` : '';
        
        depIconsHtml += `<div style="display: flex; align-items: center; cursor: help; ${bgStyle}" title="${anyIncLoaded ? 'WARNING: Incompatible mod is loaded!' : 'Has incompatible mods'}"><span class="material-symbols-outlined" style="font-size: 20px; color: #ff5252;">dangerous</span>${warn}</div>`;
    }

    let depIconsContainer = depIconsHtml !== '' ? `<div style="display: flex; gap: 8px; align-items: center; margin-right: 4px;">${depIconsHtml}</div>` : '';

    return `
        <div class="mod-item m3-card" id="mod-${safeId}" style="display: flex; flex-direction: column;">
            <div class="mod-top-row" style="display: flex; justify-content: space-between; width: 100%;">
                <div class="mod-info">
                    <div class="mod-header">
                        <strong>${mod.name}</strong>
                    </div>
                    <span class="version-text">Local Version: ${mod.version}</span>
                    <div class="ranges-container">
                        <span class="ranges-title">Supported Version Ranges:</span>
                        ${rangesHtml}
                    </div>
                </div>
                <div class="status-col" style="display: flex; align-items: center; gap: 12px; height: 100%;">
                    ${depIconsContainer}
                    <div class="status">${mod.statusHtml}</div>
                    <button class="expand-icon-btn" id="btn-expand-${safeId}" onclick="toggleDetails('${safeId}')" title="View Details">
                        <span class="material-symbols-outlined">expand_more</span>
                    </button>
                </div>
            </div>
            <div class="mod-details" id="details-${safeId}">
                ${detailsHtml}
            </div>
        </div>`;
}

loadMcVersions();