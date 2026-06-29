import {
    state,
    PRIORITY,
    capitalize,
    getFileHash,
    getHighestVersion,
    isValidRelease,
    isAtLeast1_20,
    getGroupForVersion,
    extractTarArchive,
} from "./utils.js";
import { loadMcVersions, parseJar, fetchModData } from "./api.js";
import { renderSidebar, renderAll } from "./ui.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");

window.setLoader = (loader) => {
    state.selectedLoader = loader;
    document.getElementById("btn-ldr-fabric").classList.toggle("active", loader === "fabric");
    document.getElementById("btn-ldr-quilt").classList.toggle("active", loader === "quilt");
    document.getElementById("btn-ldr-neoforge").classList.toggle("active", loader === "neoforge");
    document.getElementById("btn-ldr-forge").classList.toggle("active", loader === "forge");
    setTimeout(() => {
        evaluateAllMods();
    }, 10);
};

window.setVersion = (version) => {
    state.selectedTargetVersions = [version];
    setTimeout(() => {
        evaluateAllMods();
    }, 10);
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

function autoSelectBestEnvironment() {
    if (state.scannedMods.length === 0 || state.mcVersionsCache.length === 0) return;

    let bestLoader = state.selectedLoader;
    let bestVersion = state.selectedTargetVersions[0];
    let maxScore = -1;

    const loaders = ["fabric", "quilt", "neoforge", "forge"];

    loaders.forEach((loader) => {
        state.mcVersionsCache.forEach((cacheVer) => {
            const version = cacheVer.version;
            let score = 0;

            state.scannedMods.forEach((mod) => {
                if (!mod.apiData || mod.apiData === "ERROR") return;

                if (mod.project_type === "resourcepack" || mod.project_type === "shader") {
                    if (mod.apiData.some((r) => r.game_versions.includes(version))) {
                        score++;
                    }
                } else {
                    let filteredData = mod.apiData.filter((r) => r.loaders.includes(loader));
                    if (filteredData.some((r) => r.game_versions.includes(version))) {
                        score++;
                    }
                }
            });

            if (score > maxScore) {
                maxScore = score;
                bestLoader = loader;
                bestVersion = version;
            }
        });
    });

    if (maxScore > 0) {
        state.selectedLoader = bestLoader;
        state.selectedTargetVersions = [bestVersion];

        document.getElementById("btn-ldr-fabric")?.classList.toggle("active", bestLoader === "fabric");
        document.getElementById("btn-ldr-quilt")?.classList.toggle("active", bestLoader === "quilt");
        document.getElementById("btn-ldr-neoforge")?.classList.toggle("active", bestLoader === "neoforge");
        document.getElementById("btn-ldr-forge")?.classList.toggle("active", bestLoader === "forge");
    }
}

async function evaluateAllMods() {
    state.scannedMods.forEach((mod) => {
        if (mod.apiData === "ERROR") {
            mod.priority = PRIORITY.NOT_FOUND;
            mod.statusHtml = `<span class="badge red">Not on Modrinth / Error</span>`;
            mod.matchedRelease = null;
            return;
        }
        if (!mod.apiData) return;

        if (mod.project_type === "resourcepack" || mod.project_type === "shader") {
            mod.priority = PRIORITY.RESOURCE_SHADER;
            const targetVersion = state.selectedTargetVersions[0];
            const exactMatch = mod.apiData.find((release) => release.game_versions.includes(targetVersion));

            let allGameVersions = new Set();
            mod.apiData.forEach((release) => {
                release.game_versions.forEach((v) => {
                    if (isValidRelease(v) && isAtLeast1_20(v)) allGameVersions.add(v);
                });
            });

            const targetGroup = getGroupForVersion(targetVersion);
            const validSpoofVersions = Array.from(allGameVersions).filter((v) => targetGroup.includes(v));
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
        const targetVersion = state.selectedTargetVersions[0];
        const exactMatch = filteredData.find((release) => release.game_versions.includes(targetVersion));

        if (exactMatch) {
            mod.priority = PRIORITY.GREEN;
            mod.statusHtml = `<span class="badge green">Compatible: ${exactMatch.version_number}</span>`;
            mod.matchedRelease = exactMatch;
        } else if (filteredData.length > 0) {
            let allGameVersions = new Set();
            filteredData.forEach((release) => {
                release.game_versions.forEach((v) => {
                    if (isValidRelease(v) && isAtLeast1_20(v)) allGameVersions.add(v);
                });
            });

            const targetGroup = getGroupForVersion(targetVersion);
            const validSpoofVersions = Array.from(allGameVersions).filter((v) => targetGroup.includes(v));
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
                const res = await fetch(
                    `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`
                );
                if (res.ok) {
                    const projects = await res.json();
                    projects.forEach((p) => {
                        state.projectNameCache[p.id] = p.title || p.slug;
                    });
                }
            } catch (e) {}
        }
    }

    renderSidebar();
    renderAll();
}

async function handleFiles(files) {
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) loadingOverlay.style.display = "flex";

    try {
        const fetchPromises = [];
        let hasMrPack = false;

        let filesToProcess = Array.from(files);

        for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];

            if (file.name.endsWith(".tar") || file.name.endsWith(".tar.gz") || file.name.endsWith(".tgz")) {
                try {
                    const extractedFiles = await extractTarArchive(file);
                    if (extractedFiles.length > 0) {
                        filesToProcess.push(...extractedFiles);
                    }
                } catch (e) {
                    console.error(e);
                }
                continue;
            }

            if (file.name.endsWith(".jar") || file.name.endsWith(".zip")) {
                let isBundle = false;

                if (file.name.endsWith(".zip")) {
                    const zip = new JSZip();
                    try {
                        const contents = await zip.loadAsync(file);
                        const isResourcePack = contents.file("pack.mcmeta") !== null;
                        const isShaderPack = Object.keys(contents.files).some(
                            (name) => name.includes("shaders/") || name.includes("shaders.properties")
                        );

                        if (!isResourcePack && !isShaderPack) {
                            const extractable = [];
                            for (const [filename, zipEntry] of Object.entries(contents.files)) {
                                if (!zipEntry.dir && (filename.endsWith(".jar") || filename.endsWith(".zip"))) {
                                    extractable.push({ filename, zipEntry });
                                }
                            }
                            if (extractable.length > 0) {
                                isBundle = true;
                                for (const { filename, zipEntry } of extractable) {
                                    const blob = await zipEntry.async("blob");
                                    blob.name = filename.split("/").pop();
                                    filesToProcess.push(blob);
                                }
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }

                if (isBundle) continue;

                const hash = await getFileHash(file);
                let modData = null;

                if (file.name.endsWith(".jar")) {
                    modData = await parseJar(file);
                }

                if (!modData) {
                    modData = { id: file.name, name: file.name, version: "Unknown" };
                }

                modData.fileHash = hash;
                if (!state.scannedMods.find((m) => m.fileHash === hash)) {
                    modData.priority = PRIORITY.CHECKING;
                    modData.statusHtml = `Fetching API...`;
                    modData.apiData = null;
                    modData.matchedRelease = null;
                    state.scannedMods.push(modData);
                    fetchPromises.push(fetchModData(modData));
                }
            } else if (file.name.endsWith(".mrpack")) {
                hasMrPack = true;
                const zip = new JSZip();
                try {
                    const contents = await zip.loadAsync(file);
                    const indexFile = contents.file("modrinth.index.json");
                    if (indexFile) {
                        const rawData = await indexFile.async("string");
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
                            if (!state.scannedMods.find((m) => m.fileHash === sha1)) {
                                const modData = {
                                    id: sha1,
                                    name: filename,
                                    version: "mrpack",
                                    fileHash: sha1,
                                    priority: PRIORITY.CHECKING,
                                    statusHtml: `Fetching API...`,
                                    apiData: null,
                                    matchedRelease: null,
                                };
                                state.scannedMods.push(modData);
                                fetchPromises.push(fetchModData(modData));
                            }
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }

        renderAll();
        await Promise.all(fetchPromises);

        if (!hasMrPack && state.scannedMods.length > 0) {
            autoSelectBestEnvironment();
        }

        await evaluateAllMods();
    } finally {
        if (loadingOverlay) {
            loadingOverlay.style.display = "none";
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

loadMcVersions();
