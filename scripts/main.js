import {
    state,
    PRIORITY,
    capitalize,
    getHighestVersion,
    isVersionAllowed,
    getGroupForVersion,
} from "./utils.js";
import { loadMcVersions, fetchModData, updateVersionsCache } from "./api.js";
import { renderSidebar, renderAll, updateLoaderButtons, updateModDOM } from "./ui.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");

window.renderAll = renderAll;

async function runWithConcurrency(tasks, limit, onProgress) {
    let active = 0;
    let current = 0;
    return new Promise((resolve) => {
        const results = [];
        function next() {
            if (current === tasks.length && active === 0) return resolve(results);
            while (active < limit && current < tasks.length) {
                const index = current++;
                active++;
                tasks[index]().then(res => {
                    results[index] = res;
                    if (onProgress) onProgress();
                }).catch(() => {
                    results[index] = null;
                    if (onProgress) onProgress();
                }).finally(() => {
                    active--;
                    next();
                });
            }
        }
        next();
    });
}

async function triggerBackgroundPreciseFetches() {
    if (!window.cfPreciseQueue) window.cfPreciseQueue = [];
    state.cfPreciseFileCache = state.cfPreciseFileCache || {};

    state.scannedMods.forEach((mod) => {
        if (mod.matchedRelease && /^\d+$/.test(mod.matchedRelease.project_id)) {
            const fileId = mod.matchedRelease.id;
            const projectId = mod.matchedRelease.project_id;
            
            if (!state.cfPreciseFileCache[fileId]) {
                if (!window.cfPreciseQueue.some(t => t.fileId === fileId)) {
                    window.cfPreciseQueue.push({ mod, projectId, fileId });
                }
            } else {
                const cached = state.cfPreciseFileCache[fileId];
                mod.matchedRelease.downloads = cached.downloadCount;
                mod.matchedRelease.version_number = cached.displayName || cached.fileName;
                mod.matchedRelease.date_published = cached.fileDate;
            }
        }
    });

    if (!window.isProcessingCfQueue) {
        processCfQueue();
    }
}

async function processCfQueue() {
    window.isProcessingCfQueue = true;
    
    while (window.cfPreciseQueue.length > 0) {
        const task = window.cfPreciseQueue.shift();
        if (state.cfPreciseFileCache[task.fileId]) continue;

        try {
            const res = await fetch(`https://murad.syrupderg.workers.dev/v1/mods/${task.projectId}/files/${task.fileId}`);
            
            if (res.status === 429) {
                await new Promise(r => setTimeout(r, 3000)); 
                window.cfPreciseQueue.push(task); 
                continue; 
            }
            
            if (res.ok) {
                const json = await res.json();
                if (json.data) {
                    const precise = json.data;
                    state.cfPreciseFileCache[task.fileId] = precise;

                    if (task.mod.matchedRelease && task.mod.matchedRelease.id === task.fileId) {
                        task.mod.matchedRelease.downloads = precise.downloadCount;
                        task.mod.matchedRelease.version_number = precise.displayName || precise.fileName;
                        task.mod.matchedRelease.date_published = precise.fileDate;
                        
                        updateModDOM(task.mod);
                    }
                }
            }
            
            await new Promise(r => setTimeout(r, 200)); 
        } catch (e) {
            console.warn("Precise fetch error", e);
        }
    }
    
    window.isProcessingCfQueue = false;
}

function showLoadingAndUpdate(textMessage = "Processing...") {
    const loadingOverlay = document.getElementById("loading-overlay");
    const loadingText = document.querySelector(".loading-text");
    const progressTrack = document.getElementById("loading-progress-track");
    
    if (loadingOverlay && loadingText) {
        loadingText.innerText = textMessage;
        loadingOverlay.style.display = "flex";
        if (progressTrack) progressTrack.style.display = "none"; 
    }

    setTimeout(async () => {
        updateVersionsCache();
        await evaluateAllMods();
        
        if (loadingOverlay) {
            loadingOverlay.style.display = "none";
            loadingText.innerText = "Processing Files..."; 
        }
    }, 50);
}

window.setLoader = (loader) => {
    state.selectedLoader = loader;
    document.getElementById("btn-ldr-fabric").classList.toggle("active", loader === "fabric");
    document.getElementById("btn-ldr-quilt").classList.toggle("active", loader === "quilt");
    document.getElementById("btn-ldr-neoforge").classList.toggle("active", loader === "neoforge");
    document.getElementById("btn-ldr-forge").classList.toggle("active", loader === "forge");
    
    showLoadingAndUpdate("Switching Loader...");
};

window.toggleSnapshots = (e) => {
    state.includeSnapshots = e.target.checked;
    showLoadingAndUpdate("Loading Snapshots...");
};

window.toggleOlderVersions = (e) => {
    state.showOlderVersions = e.target.checked;
    showLoadingAndUpdate("Loading Older Versions...");
};

window.setVersion = (version) => {
    state.selectedTargetVersions = [version];
    showLoadingAndUpdate("Evaluating Mods...");
};

window.handleSearch = (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    setTimeout(() => {
        renderAll();
    }, 10);
};

window.toggleDetails = (modId) => {
    const details = document.getElementById(`details-${modId}`);
    const iconBtn = document.getElementById(`btn-expand-${modId}`);
    if (details.classList.contains("expanded")) {
        details.classList.remove("expanded");
        iconBtn.classList.remove("expanded");
    } else {
        details.classList.add("expanded");
        iconBtn.classList.add("expanded");
    }
};

window.toggleSort = (mode) => {
    if (state.currentSortMode === mode) {
        if (mode === "NAME") state.nameSortDir *= -1;
        if (mode === "COMP") state.compSortDir *= -1;
    } else state.currentSortMode = mode;
    setTimeout(() => {
        renderAll();
    }, 10);
};

window.toggleCatSort = (priority) => {
    state.catSortDirs[priority] *= -1;
    setTimeout(() => {
        renderAll();
    }, 10);
};

window.downloadOverrideFile = () => {
    if (!state.pendingOverrideDataStr) return;
    const downloadNode = document.createElement("a");
    downloadNode.setAttribute("href", state.pendingOverrideDataStr);
    downloadNode.setAttribute("download", state.pendingOverrideFileName || "override_dependencies");
    document.body.appendChild(downloadNode);
    downloadNode.click();
    downloadNode.remove();
};

window.copyOverrideData = async (btnElement) => {
    const textToCopy = document.getElementById("override-json-preview").innerText;
    try {
        await navigator.clipboard.writeText(textToCopy);
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">check</span> Copied!`;
        btnElement.style.background = "#1bd96a";
        btnElement.style.color = "#000";
        setTimeout(() => {
            btnElement.innerHTML = originalHtml;
            btnElement.style.background = ""; 
            btnElement.style.color = "";
        }, 2000);
    } catch (err) {
        console.error("Failed to copy:", err);
    }
};

window.downloadModPack = async (format) => {
    const excludeKinda = document.getElementById("exclude-kinda-checkbox")?.checked;
    const filteredList = state.scannedMods.filter((m) => m.name.toLowerCase().includes(state.searchQuery));
    const validMods = filteredList.filter((m) => {
        if (!m.matchedRelease) return false;
        if (m.priority === 1 || m.priority === 6) return true;
        if (m.priority === 2 && !excludeKinda) return true;
        return false;
    });
    if (validMods.length === 0) return;
    const btnZip = document.getElementById("btn-download-zip");
    const btnMrpack = document.getElementById("btn-download-mrpack");
    const progressBar = document.getElementById("download-progress-bar");
    const statusText = document.getElementById("download-status-text");
    if (btnZip) btnZip.disabled = true;
    if (btnMrpack) btnMrpack.disabled = true;
    progressBar.style.width = "0%";
    const zip = new JSZip();
    if (format === "mrpack") {
        statusText.innerText = "Building Modrinth Modpack Metadata (.mrpack)...";
        progressBar.style.width = "50%";
        const safeLoader = state.selectedLoader === "neoforge" ? "neo-forge" : state.selectedLoader;
        const indexJson = {
            formatVersion: 1,
            game: "minecraft",
            versionId: state.selectedTargetVersions[0],
            name: `MURAD ${capitalize(state.selectedLoader)} Pack`,
            dependencies: { minecraft: state.selectedTargetVersions[0] },
            files: [],
        };
        indexJson.dependencies[safeLoader] = "*";
        for (const mod of validMods) {
            const rel = mod.matchedRelease;
            const primaryFile = rel.files.find((f) => f.primary) || rel.files[0];
            if (primaryFile && primaryFile.hashes) {
                indexJson.files.push({
                    path: `mods/${primaryFile.filename}`,
                    hashes: primaryFile.hashes,
                    downloads: [primaryFile.url],
                    fileSize: primaryFile.size,
                });
            }
        }
        zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 4));
        progressBar.style.width = "100%";
        zip.generateAsync({ type: "blob" }).then(function (content) {
            const downloadNode = document.createElement("a");
            downloadNode.href = URL.createObjectURL(content);
            downloadNode.download = `murad_pack_${state.selectedLoader}_${state.selectedTargetVersions[0]}.mrpack`;
            document.body.appendChild(downloadNode);
            downloadNode.click();
            document.body.removeChild(downloadNode);
            statusText.innerText = "Download complete!";
            setTimeout(() => {
                if (btnZip) btnZip.disabled = false;
                if (btnMrpack) btnMrpack.disabled = false;
                progressBar.style.width = "0%";
                statusText.innerText = "Waiting to download...";
            }, 3000);
        });
    } else {
        let completed = 0;
        for (const mod of validMods) {
            const rel = mod.matchedRelease;
            const primaryFile = rel.files.find((f) => f.primary) || rel.files[0];
            if (primaryFile) {
                statusText.innerText = `Downloading ${primaryFile.filename}...`;
                try {
                    const response = await fetch(primaryFile.url);
                    if (response.ok) {
                        const blob = await response.blob();
                        zip.file(primaryFile.filename, blob);
                    }
                } catch (e) {
                    console.error(e);
                }
            }
            completed++;
            progressBar.style.width = `${(completed / validMods.length) * 100}%`;
        }
        statusText.innerText = "Building ZIP archive... This may take a moment.";
        zip.generateAsync({ type: "blob" }).then(function (content) {
            const downloadNode = document.createElement("a");
            downloadNode.href = URL.createObjectURL(content);
            downloadNode.download = `murad_pack_${state.selectedLoader}_${state.selectedTargetVersions[0]}.zip`;
            document.body.appendChild(downloadNode);
            downloadNode.click();
            document.body.removeChild(downloadNode);
            statusText.innerText = "Download complete!";
            setTimeout(() => {
                if (btnZip) btnZip.disabled = false;
                if (btnMrpack) btnMrpack.disabled = false;
                progressBar.style.width = "0%";
                statusText.innerText = "Waiting to download...";
            }, 3000);
        });
    }
};

async function evaluateAllMods() {
    state.scannedMods.forEach((mod) => {
        if (mod.apiData === "ERROR") {
            mod.priority = PRIORITY.NOT_FOUND;
            mod.statusHtml = `<span class="badge red">Not found on Modrinth or CurseForge</span>`;
            mod.matchedRelease = null;
            return;
        }
        if (!mod.apiData || !Array.isArray(mod.apiData)) return;

        const targetVersion = state.selectedTargetVersions[0];
        
        const targetMinor = parseInt(targetVersion.split('.')[1], 10);
        if (targetMinor <= 12) {
            mod.apiData.sort((a, b) => {
                const aIsCF = /^\d+$/.test(a.project_id);
                const bIsCF = /^\d+$/.test(b.project_id);
                if (aIsCF && !bIsCF) return -1;
                if (!aIsCF && bIsCF) return 1;
                return 0;
            });
        }

        if (mod.project_type === "resourcepack" || mod.project_type === "shader") {
            mod.priority = PRIORITY.RESOURCE_SHADER;
            const exactMatch = mod.apiData.find((release) => release.game_versions.includes(targetVersion));
            let allGameVersions = new Set();
            mod.apiData.forEach((release) => {
                release.game_versions.forEach((v) => {
                if (isVersionAllowed(v)) allGameVersions.add(v);
                });
            });
            const targetGroupName = getGroupForVersion(targetVersion);
            const validSpoofVersions = Array.from(allGameVersions).filter((v) => getGroupForVersion(v) === targetGroupName);
            const latestMc = getHighestVersion(Array.from(allGameVersions)) || "Unknown";
            if (exactMatch) {
                mod.statusHtml = `<span class="badge green">Compatible: ${exactMatch.version_number}</span>`;
                mod.matchedRelease = exactMatch;
            } else if (validSpoofVersions.length > 0) {
                const spoofAs = getHighestVersion(validSpoofVersions);
                mod.matchedRelease = mod.apiData.find((r) => r.game_versions.includes(spoofAs));
                const modVersion = mod.matchedRelease ? mod.matchedRelease.version_number : spoofAs;
                mod.statusHtml = `
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <span class="badge yellow" style="white-space: normal; max-width: 182px; text-align: center;">
                            <a>Kinda Compatible: ${modVersion}</a> <br><br>
                            This ${mod.project_type === "shader" ? "shader" : "pack"} supports <u>${latestMc}</u>, but it can work with <u>${targetVersion}</u> after some tweaking.
                        </span>
                    </div>`;
            } else {
                mod.matchedRelease = mod.apiData[0] || null;
                mod.statusHtml = `<span class="badge red">${targetVersion} is not supported</span>`;
            }
            return;
        }
        let filteredData = mod.apiData.filter((release) => release.loaders.includes(state.selectedLoader));
        const exactMatch = filteredData.find((release) => release.game_versions.includes(targetVersion));
        if (exactMatch) {
            mod.priority = PRIORITY.GREEN;
            mod.statusHtml = `<span class="badge green">Compatible: ${exactMatch.version_number}</span>`;
            mod.matchedRelease = exactMatch;
        } else if (filteredData.length > 0) {
            let allGameVersions = new Set();
            filteredData.forEach((release) => {
                release.game_versions.forEach((v) => {
                if (isVersionAllowed(v)) allGameVersions.add(v);
                });
            });
            const targetGroupName = getGroupForVersion(targetVersion);
            const validSpoofVersions = Array.from(allGameVersions).filter((v) => getGroupForVersion(v) === targetGroupName);
            const latestMc = getHighestVersion(Array.from(allGameVersions)) || "Unknown";
            if (validSpoofVersions.length > 0) {
                const spoofAs = getHighestVersion(validSpoofVersions);
                mod.priority = PRIORITY.YELLOW;
                mod.matchedRelease = filteredData.find((r) => r.game_versions.includes(spoofAs));
                const modVersion = mod.matchedRelease ? mod.matchedRelease.version_number : spoofAs;
                mod.statusHtml = `
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <span class="badge yellow" style="white-space: normal; max-width: 182px; text-align: center;">
                            <a>Kinda Compatible: ${modVersion}</a> <br><br>
                            This mod supports <u>${latestMc}</u>, but it can work with <u>${targetVersion}</u> after some tweaking.
                        </span>
                    </div>`;
            } else {
                mod.priority = PRIORITY.RED;
                mod.statusHtml = `<span class="badge red">${targetVersion} is not supported</span>`;
                mod.matchedRelease = filteredData[0];
            }
        } else {
            mod.priority = PRIORITY.RED;
            mod.statusHtml = `<span class="badge red">No ${capitalize(state.selectedLoader)} releases</span>`;
            mod.matchedRelease = null;
        }
    });

    let depsToFetch = new Set();
    state.scannedMods.forEach((mod) => {
        if (mod.matchedRelease && mod.matchedRelease.dependencies) {
            mod.matchedRelease.dependencies.forEach((d) => {
                if (d.project_id && !state.projectNameCache[d.project_id]) {
                    depsToFetch.add(d.project_id);
                }
            });
        }
    });

    if (depsToFetch.size > 0) {
        const idsArray = Array.from(depsToFetch);
        for (let i = 0; i < idsArray.length; i += 100) {
            const chunk = idsArray.slice(i, i + 100);
            try {
                const cfIds = chunk.filter(id => /^\d+$/.test(id));
                const mrIds = chunk.filter(id => !/^\d+$/.test(id));

                if (mrIds.length > 0) {
                    const res = await fetch(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(mrIds))}`);
                    if (res.ok) {
                        const projects = await res.json();
                        if (!state.projectSlugCache) state.projectSlugCache = {};
                        projects.forEach(p => {
                            state.projectNameCache[p.id] = p.title || p.slug;
                            state.projectSlugCache[p.id] = p.slug;
                        });
                    }
                }

                if (cfIds.length > 0) {
                    const res = await fetch(`https://murad.syrupderg.workers.dev/v1/mods`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ modIds: cfIds.map(Number) })
                    });
                    if (res.ok) {
                        const responseData = await res.json();
                        if (!state.projectSlugCache) state.projectSlugCache = {};
                        responseData.data.forEach(p => {
                            state.projectNameCache[p.id.toString()] = p.name;
                            state.projectSlugCache[p.id.toString()] = p.slug;
                        });
                    }
                }
            } catch (e) {}
        }
    }

    renderSidebar();
    renderAll();
    updateLoaderButtons();
    
    triggerBackgroundPreciseFetches();
}

async function handleFiles(files) {
    const loadingOverlay = document.getElementById("loading-overlay");
    const progressTrack = document.getElementById("loading-progress-track");
    const progressBar = document.getElementById("loading-progress-bar");
    const loadingText = document.querySelector(".loading-text");

    if (loadingOverlay) loadingOverlay.style.display = "flex";
    if (progressTrack) progressTrack.style.display = "block";
    if (progressBar) progressBar.style.width = "0%";

    try {
        const fetchTasks = [];
        let filesToProcess = Array.from(files);
        
        for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];
            
            if (loadingText) loadingText.innerText = `Reading file ${i + 1} of ${filesToProcess.length}...`;
            if (progressBar) progressBar.style.width = `${((i + 1) / filesToProcess.length) * 40}%`;

            if (file.name.endsWith(".mrpack") || file.name.endsWith(".zip")) {
                const zip = new JSZip();
                try {
                    const contents = await zip.loadAsync(file);
                    
                    const mrIndex = contents.file("modrinth.index.json") || contents.file("mrpack/modrinth.index.json");
                    const cfManifest = contents.file("manifest.json");

                    if (mrIndex) {
                        const rawData = await mrIndex.async("string");
                        const indexJson = JSON.parse(rawData);
                        
                        if (indexJson.dependencies) {
                            if (indexJson.dependencies.minecraft) {
                                state.selectedTargetVersions = [indexJson.dependencies.minecraft];
                            }
                            let foundLoader = null;
                            if (indexJson.dependencies["fabric-loader"]) foundLoader = "fabric";
                            else if (indexJson.dependencies["quilt-loader"]) foundLoader = "quilt";
                            else if (indexJson.dependencies["neoforge"] || indexJson.dependencies["neo-forge"])
                                foundLoader = "neoforge";
                            else if (indexJson.dependencies["forge"]) foundLoader = "forge";
                            
                            if (foundLoader) {
                                state.selectedLoader = foundLoader;
                                document
                                    .getElementById("btn-ldr-fabric")
                                    ?.classList.toggle("active", foundLoader === "fabric");
                                document
                                    .getElementById("btn-ldr-quilt")
                                    ?.classList.toggle("active", foundLoader === "quilt");
                                document
                                    .getElementById("btn-ldr-neoforge")
                                    ?.classList.toggle("active", foundLoader === "neoforge");
                                document
                                    .getElementById("btn-ldr-forge")
                                    ?.classList.toggle("active", foundLoader === "forge");
                            }
                        }
                        
                        for (const modFile of indexJson.files) {
                            const sha1 = modFile.hashes.sha1;
                            const filename = modFile.path.split("/").pop() || "Unknown File";
                            
                            let exactProjectId = sha1;
                            if (modFile.downloads && Array.isArray(modFile.downloads)) {
                                for (const url of modFile.downloads) {
                                    const match = url.match(/cdn\.modrinth\.com\/data\/([a-zA-Z0-9]+)\/versions\//);
                                    if (match) {
                                        exactProjectId = match[1];
                                        break;
                                    }
                                }
                            }

                            if (!state.scannedMods.find((m) => m.fileHash === sha1)) {
                                const modData = {
                                    id: exactProjectId,
                                    name: filename,
                                    version: "mrpack",
                                    type: "modrinth", 
                                    fileHash: sha1,
                                    priority: PRIORITY.CHECKING,
                                    statusHtml: `Fetching API...`,
                                    apiData: null,
                                    matchedRelease: null,
                                };
                                state.scannedMods.push(modData);
                                fetchTasks.push(() => fetchModData(modData));
                            }
                        }
                    } 
                    else if (cfManifest) {
                        const rawData = await cfManifest.async("string");
                        const manifestJson = JSON.parse(rawData);

                        if (manifestJson.minecraft) {
                            state.selectedTargetVersions = [manifestJson.minecraft.version];
                            
                            let foundLoader = null;
                            const loaders = manifestJson.minecraft.modLoaders || [];
                            if (loaders.length > 0) {
                                const loaderId = loaders[0].id.toLowerCase();
                                if (loaderId.includes("fabric")) foundLoader = "fabric";
                                else if (loaderId.includes("quilt")) foundLoader = "quilt";
                                else if (loaderId.includes("neoforge") || loaderId.includes("neo-forge")) foundLoader = "neoforge";
                                else if (loaderId.includes("forge")) foundLoader = "forge";
                            }
                            
                            if (foundLoader) {
                                state.selectedLoader = foundLoader;
                                document
                                    .getElementById("btn-ldr-fabric")
                                    ?.classList.toggle("active", foundLoader === "fabric");
                                document
                                    .getElementById("btn-ldr-quilt")
                                    ?.classList.toggle("active", foundLoader === "quilt");
                                document
                                    .getElementById("btn-ldr-neoforge")
                                    ?.classList.toggle("active", foundLoader === "neoforge");
                                document
                                    .getElementById("btn-ldr-forge")
                                    ?.classList.toggle("active", foundLoader === "forge");
                            }
                        }

                        for (const fileItem of manifestJson.files) {
                            const projectId = fileItem.projectID;
                            const fileId = fileItem.fileID;
                            
                            if (!state.scannedMods.find((m) => m.fileHash === fileId.toString())) {
                                const modData = {
                                    id: projectId.toString(),
                                    fileId: fileId,
                                    name: `Loading CF Mod (${projectId})...`,
                                    version: "cfpack",
                                    type: "curseforge",
                                    fileHash: fileId.toString(),
                                    priority: PRIORITY.CHECKING,
                                    statusHtml: `Fetching API...`,
                                    apiData: null,
                                    matchedRelease: null,
                                };
                                state.scannedMods.push(modData);
                                fetchTasks.push(() => fetchModData(modData));
                            }
                        }
                    } 
                    else {
                        console.warn(`Skipped ${file.name}: No valid modpack manifest found.`);
                    }
                } catch (e) {
                    console.error(`Failed to parse archive ${file.name}:`, e);
                }
            }
        }
        
        renderAll();
        
        const totalFetches = fetchTasks.length;
        if (totalFetches > 0) {
            if (loadingText) loadingText.innerText = `Fetching API data for ${totalFetches} mods...`;
            let completedFetches = 0;
            
            await runWithConcurrency(fetchTasks, 5, () => {
                completedFetches++;
                if (progressBar) progressBar.style.width = `${40 + (completedFetches / totalFetches) * 50}%`;
            });
        } else {
            if (progressBar) progressBar.style.width = "90%";
        }

        if (loadingText) loadingText.innerText = "Evaluating compatibility...";
        
        await evaluateAllMods();
        if (progressBar) progressBar.style.width = "100%";
        
    } finally {
        if (loadingOverlay) {
            loadingOverlay.style.display = "none";
        }
        if (progressTrack) {
            progressTrack.style.display = "none";
        }
    }
}

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

document.addEventListener("DOMContentLoaded", () => {
    const snapshotsToggle = document.getElementById("toggle-snapshots");
    if (snapshotsToggle) {
        state.includeSnapshots = snapshotsToggle.checked;
    }

    const olderToggle = document.getElementById("toggle-older");
    if (olderToggle) {
        state.showOlderVersions = olderToggle.checked;
    }

    loadMcVersions();
});

const urlInput = document.getElementById("url-input");
const btnFetchUrl = document.getElementById("btn-fetch-url");

if (urlInput) {
    urlInput.addEventListener("click", (e) => e.stopPropagation());
}

if (btnFetchUrl) {
    btnFetchUrl.addEventListener("click", async (e) => {
        e.stopPropagation();
        const rawUrl = urlInput.value.trim();
        if (!rawUrl) return;

        const loadingOverlay = document.getElementById("loading-overlay");
        const loadingText = document.querySelector(".loading-text");

        try {
            loadingOverlay.style.display = "flex";
            loadingText.innerText = "Resolving URL...";

            let downloadUrl = rawUrl;
            let filename = "";

            const mrMatch = rawUrl.match(/modrinth\.com\/(?:mod|modpack|resourcepack|shader)\/([^/]+)\/version\/([^/?#]+)/);
            if (mrMatch) {
                loadingText.innerText = "Fetching Modrinth version...";
                const projectSlug = mrMatch[1];
                const versionId = mrMatch[2];
                const res = await fetch(`https://api.modrinth.com/v2/project/${projectSlug}/version/${versionId}`);
                if (!res.ok) throw new Error("Modrinth API error");
                const data = await res.json();
                const primary = data.files.find(f => f.primary) || data.files[0];
                downloadUrl = primary.url;
                filename = primary.filename;
            } 
            else if (rawUrl.includes("curseforge.com")) {
                loadingText.innerText = "Resolving CurseForge link...";
                const cfMatch = rawUrl.match(/curseforge\.com\/minecraft\/(?:mc-mods|modpacks|texture-packs|customization)\/([^/]+)\/(?:files|download)\/(\d+)/);
                if (!cfMatch) throw new Error("Could not parse CurseForge URL. Must include project slug and file ID.");
                
                const projectSlug = cfMatch[1];
                const fileId = cfMatch[2];
                const CF_WORKER = "https://murad.syrupderg.workers.dev";

                const searchRes = await fetch(`${CF_WORKER}/v1/mods/search?gameId=432&slug=${projectSlug}`);
                if (!searchRes.ok) throw new Error("CurseForge worker API error (search)");
                const searchData = await searchRes.json();
                if (!searchData.data || searchData.data.length === 0) throw new Error("Mod not found on CurseForge");
                const modId = searchData.data[0].id;

                const downloadRes = await fetch(`${CF_WORKER}/v1/mods/${modId}/files/${fileId}/download-url`);
                if (!downloadRes.ok) throw new Error("Failed to get CurseForge download URL from worker");
                const downloadData = await downloadRes.json();
                
                const fileRes = await fetch(`${CF_WORKER}/v1/mods/${modId}/files/${fileId}`);
                if (fileRes.ok) {
                    const fileData = await fileRes.json();
                    filename = fileData.data.fileName;
                }
                
                downloadUrl = `${CF_WORKER}/proxy-download?url=${encodeURIComponent(downloadData.data)}&filename=${encodeURIComponent(filename)}`;
            }
            loadingText.innerText = "Downloading...";
            const response = await fetch(downloadUrl);
            const blob = await response.blob();
            
            const file = new File([blob], filename || "downloaded.mrpack", { 
                type: blob.type,
                lastModified: Date.now() 
            });
            
            loadingOverlay.style.display = "none";
            urlInput.value = "";
            
            handleFiles([file]);

        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
            loadingOverlay.style.display = "none";
        }
    });
}