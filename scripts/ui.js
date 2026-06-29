import {
    state,
    PRIORITY,
    PRIORITY_NAMES,
    LOADER_FILES,
    TINY_LOADER_FILES,
    LOADER_COLORS,
    LOADER_SORT_ORDER,
    parseVersion,
    timeAgo,
    capitalize,
    getHighestVersion,
    getLoaderVersionRanges,
    getGroupForVersion
} from "./utils.js";

export function renderSidebar() {
    const versionSelector = document.getElementById("version-selector");
    if (!versionSelector) return;

    const totalValidMods = state.scannedMods.filter((m) => m.apiData && m.apiData !== "ERROR").length;
    let html = "";
    let renderedVersions = new Set();
    let groupedHtml = {};
    let groupOrder = [];

    const versionSupportCounts = {};
    if (totalValidMods > 0) {
        state.scannedMods.forEach((m) => {
            if (!m.apiData || m.apiData === "ERROR") return;
            
            let handledVersions = new Set();
            
            if (m.priority === PRIORITY.RESOURCE_SHADER) {
                m.apiData.forEach(release => {
                    release.game_versions.forEach(v => handledVersions.add(v));
                });
            } else {
                let filteredData = m.apiData.filter(release => release.loaders.includes(state.selectedLoader));
                filteredData.forEach(release => {
                    release.game_versions.forEach(v => handledVersions.add(v));
                });
            }
            
            handledVersions.forEach(v => {
                versionSupportCounts[v] = (versionSupportCounts[v] || 0) + 1;
            });
        });
    }

    state.mcVersionsCache.forEach((cacheVer) => {
        if (renderedVersions.has(cacheVer.version)) return;
        renderedVersions.add(cacheVer.version);

        let groupName = getGroupForVersion(cacheVer.version);

        if (!groupedHtml[groupName]) {
            groupedHtml[groupName] = [];
            groupOrder.push(groupName); 
        }

        groupedHtml[groupName].push(generateSidebarButton(cacheVer.version, totalValidMods, versionSupportCounts));
    });

    groupOrder.forEach((groupName) => {
        html += `<div class="v-group-title">${groupName}</div>`;
        html += groupedHtml[groupName].join("");
    });

    versionSelector.innerHTML = html;

    function generateSidebarButton(versionName, totalValidMods, supportMap) {
        let compCount = supportMap[versionName] || 0;
        
        const pct = totalValidMods > 0 ? Math.round((compCount / totalValidMods) * 100) : 0;
        let pctHtml = "";
        if (totalValidMods > 0) {
            let pctClass = "", emoji = "";
            if (pct === 100) {
                pctClass = "pct-green";
                emoji = "✅";
            } else if (pct >= 75) {
                pctClass = "pct-green";
            } else if (pct >= 50) {
                pctClass = "pct-yellow";
            } else if (pct >= 25) {
                pctClass = "pct-orange";
            } else if (pct > 0) {
                pctClass = "pct-red";
            } else {
                pctClass = "pct-red";
                emoji = "❌";
            }
            pctHtml = `<span class="pct ${pctClass}">${pct}% ${emoji}</span>`;
        }
        const isActive = state.selectedTargetVersions[0] === versionName;
        return `
            <button class="v-btn ${isActive ? "active" : ""}" onclick="setVersion('${versionName}')">
                <span>${versionName}</span> ${pctHtml}
            </button>
        `;
    }
}

export function updateStatsUI(list) {
    const statsContainer = document.getElementById("detailed-stats");
    const depsStatsContainer = document.getElementById("detailed-stats-deps");
    if (list.length === 0) {
        statsContainer.style.display = "none";
        depsStatsContainer.style.display = "none";
        return;
    }
    statsContainer.style.display = "flex";
    statsContainer.innerHTML = `
        <span class="stat-total">Total Mods: ${list.length}</span>
        <span class="stat-green">${list.filter((m) => m.priority === 1).length} Compatible</span>
        <span class="stat-yellow">${list.filter((m) => m.priority === 2).length} Kinda Compatible</span>
        <span class="stat-red">${list.filter((m) => m.priority === 3).length} Incompatible</span>
        <span style="color: #448aff; font-weight: bold;">${list.filter((m) => m.priority === 6).length} Cosmetics</span>
        <span class="stat-gray">${list.filter((m) => m.priority === 4 || m.priority === 5).length} Not Found</span>
    `;
    let uniqueReq = new Set();
    let uniqueOpt = new Set();
    let uniqueInc = new Set();
    list.forEach((mod) => {
        if (mod.matchedRelease && mod.matchedRelease.dependencies) {
            mod.matchedRelease.dependencies.forEach((d) => {
                if (!d.project_id) return;
                if (d.dependency_type === "required") uniqueReq.add(d.project_id);
                else if (d.dependency_type === "optional") uniqueOpt.add(d.project_id);
                else if (d.dependency_type === "incompatible") uniqueInc.add(d.project_id);
            });
        }
    });
    const totalReq = uniqueReq.size;
    const totalOpt = uniqueOpt.size;
    const totalInc = uniqueInc.size;
    let missingReqCount = 0;
    uniqueReq.forEach((reqId) => {
        const name = state.projectNameCache[reqId] || reqId;
        const isLoaded = state.scannedMods.some(
            (m) => (m.matchedRelease && m.matchedRelease.project_id === reqId) || m.id === reqId || m.id === name
        );
        if (!isLoaded) {
            missingReqCount++;
        }
    });
    const reqText = missingReqCount > 0 ? `${totalReq} Required (${missingReqCount} Missing)` : `${totalReq} Required`;
    if (totalReq > 0 || totalOpt > 0 || totalInc > 0) {
        depsStatsContainer.style.display = "flex";
        depsStatsContainer.innerHTML = `
            <span class="stat-total">Total Dependencies: ${totalReq + totalOpt + totalInc}</span>
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
        depsStatsContainer.style.display = "none";
    }
}

export function updateOverrideBar(list) {
    const overrideBar = document.getElementById("override-bar");
    if (!overrideBar) return;
    const countEl = document.getElementById("override-count");
    const kindaCompMods = list.filter((m) => m.priority === 2 && m.name.toLowerCase().includes(state.searchQuery));
    if (kindaCompMods.length > 0) {
        overrideBar.style.display = "flex";
        countEl.innerText = kindaCompMods.length;
        let headerText = "";
        let instructionsHtml = "";
        let codeContent = "";
        if (state.selectedLoader === "fabric" || state.selectedLoader === "quilt") {
            headerText = "Fabric/Quilt Dependency Override";
            instructionsHtml = `
                <p>Download this JSON file to trick these mods into working.</p>
                <p>Place it in your config folder: <span class="path-example">.minecraft/config/fabric_loader_dependencies.json</span></p>
            `;
            const overrides = {};
            kindaCompMods.forEach((mod) => {
                overrides[mod.id] = { "-depends": { minecraft: "IGNORED" } };
            });
            codeContent = JSON.stringify({ version: 1, overrides: overrides }, null, 4);
            state.pendingOverrideFileName = "fabric_loader_dependencies.json";
            state.pendingOverrideDataStr = "data:text/json;charset=utf-8," + encodeURIComponent(codeContent);
        } else {
            headerText = "Forge/NeoForge Dependency Override";
            instructionsHtml = `
                <p>Download this TOML file to trick these mods into working.</p>
                <p>Place it in your config folder: <span class="path-example">.minecraft/config/fml.toml</span></p>
                <p style="color: #ffb74d; font-size: 0.8rem; margin-top: 6px;">⚠️ <strong>Note:</strong> If fml.toml already exists in your config folder, copy the block below into your existing file instead of overwriting it.</p>
            `;
            let tomlLines = ["[dependencyOverrides]"];
            kindaCompMods.forEach((mod) => {
                tomlLines.push(`"${mod.id}" = ["-minecraft"]`);
            });
            codeContent = tomlLines.join("\n");
            state.pendingOverrideFileName = "fml.toml";
            state.pendingOverrideDataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(codeContent);
        }
        const headerEl = overrideBar.querySelector(".override-header span");
        if (headerEl) headerEl.innerText = headerText;
        const instructionsEl = overrideBar.querySelector(".preview-instructions");
        if (instructionsEl) instructionsEl.innerHTML = instructionsHtml;
        document.getElementById("override-json-preview").innerText = codeContent;
    } else {
        overrideBar.style.display = "none";
    }
}

export function updateDownloadPackBar(list) {
    const downloadBar = document.getElementById("download-pack-bar");
    if (!downloadBar) return;
    const excludeKinda = document.getElementById("exclude-kinda-checkbox")?.checked || false;
    let validMods = list.filter((m) => {
        if (m.priority === 1 || m.priority === 6) return true;
        if (m.priority === 2 && !excludeKinda) return true;
        return false;
    });
    const incompatibleMods = list.filter((m) => m.priority === 3);
    if (validMods.length > 0) {
        downloadBar.style.display = "flex";
        document.getElementById("pack-count").innerText = validMods.length;
        document.getElementById("pack-version").innerText = state.selectedTargetVersions[0];
        const warningEl = document.getElementById("pack-warning");
        if (incompatibleMods.length > 0) {
            warningEl.style.display = "inline-flex";
            document.getElementById("incompatible-count").innerText = incompatibleMods.length;
        } else {
            warningEl.style.display = "none";
        }
        validMods.sort((a, b) => a.name.localeCompare(b.name));
        document.getElementById("pack-mod-list").innerHTML = validMods
            .map(
                (m) => `
            <div class="pack-mod-item">
                <span>${m.name}</span>
                <span style="color: #9aa0a6;">${m.matchedRelease ? m.matchedRelease.version_number : "Unknown"}</span>
            </div>
        `
            )
            .join("");
    } else {
        downloadBar.style.display = "none";
    }
}

export function renderAll() {
    const modList = document.getElementById("mod-list");
    if (!modList) return;
    let displayList = state.scannedMods.filter((mod) => mod.name.toLowerCase().includes(state.searchQuery));
    updateStatsUI(displayList);
    updateOverrideBar(state.scannedMods);
    updateDownloadPackBar(displayList);
    const btnName = document.getElementById("btn-sort-name"),
        btnComp = document.getElementById("btn-sort-comp");
    btnName.className = `sort-btn ${state.currentSortMode === "NAME" ? "active" : ""}`;
    btnName.innerText = `Name: ${state.nameSortDir === 1 ? "A-Z" : "Z-A"}`;
    btnComp.className = `sort-btn ${state.currentSortMode === "COMP" ? "active" : ""}`;
    btnComp.innerText = `Compatibility: ${state.compSortDir === 1 ? "Best to Worst" : "Worst to Best"}`;
    let htmlBuilder = "";
    if (state.currentSortMode === "NAME") {
        displayList.sort((a, b) => a.name.localeCompare(b.name) * state.nameSortDir);
        displayList.forEach((mod) => {
            htmlBuilder += generateModHTML(mod);
        });
    } else if (state.currentSortMode === "COMP") {
        const priorities = state.compSortDir === 1 ? [1, 2, 6, 3, 4, 5] : [5, 4, 3, 6, 2, 1];
        priorities.forEach((p) => {
            let group = displayList.filter((m) => m.priority === p);
            if (group.length > 0) {
                let catDir = state.catSortDirs[p];
                group.sort((a, b) => a.name.localeCompare(b.name) * catDir);
                htmlBuilder += `
                    <div class="category-header">
                        <span>${PRIORITY_NAMES[p]} (${group.length})</span>
                        <button class="cat-sort-btn" onclick="toggleCatSort(${p})">${catDir === 1 ? "A-Z" : "Z-A"}</button>
                    </div>`;
                group.forEach((mod) => {
                    htmlBuilder += generateModHTML(mod);
                });
            }
        });
    }
    modList.innerHTML = htmlBuilder;
}

function generateModHTML(mod) {
    let rangesHtml = '<span class="range-text">Loading...</span>';
    let detailsHtml = "";
    let hasRequiredDeps = false,
        hasOptionalDeps = false,
        hasIncompatibleDeps = false;
    let allReqLoaded = false,
        anyOptLoaded = false,
        anyIncLoaded = false;
    let depsHtml = "";
    if (mod.matchedRelease && mod.matchedRelease.dependencies && mod.matchedRelease.dependencies.length > 0) {
        const deps = mod.matchedRelease.dependencies;
        const reqDeps = deps.filter((d) => d.dependency_type === "required");
        const optDeps = deps.filter((d) => d.dependency_type === "optional");
        const incDeps = deps.filter((d) => d.dependency_type === "incompatible");
        const isDepLoaded = (d) => {
            if (!d.project_id) return false;
            const name = state.projectNameCache[d.project_id] || d.project_id;
            return state.scannedMods.some(
                (m) =>
                    (m.matchedRelease && m.matchedRelease.project_id === d.project_id) ||
                    m.id === d.project_id ||
                    m.id === name
            );
        };
        if (reqDeps.length > 0) {
            hasRequiredDeps = true;
            allReqLoaded = reqDeps.every(isDepLoaded);
        }
        if (optDeps.length > 0) {
            hasOptionalDeps = true;
            anyOptLoaded = optDeps.some(isDepLoaded);
        }
        if (incDeps.length > 0) {
            hasIncompatibleDeps = true;
            anyIncLoaded = incDeps.some(isDepLoaded);
        }
        const formatApiDeps = (depList, type, color, icon) => {
            if (depList.length === 0) return "";
            const extraStyle = type === "Incompatible" ? "width: 113px;" : "";
            return `
                <div class="dep-group">
                    <span class="dep-type" style="color: ${color}; display: flex; align-items: center; gap: 4px; ${extraStyle}">
                        <span class="material-symbols-outlined" style="font-size: 20px;">${icon}</span>${type}:
                    </span>
                    <div class="dep-list">
                        ${depList
                            .map((d) => {
                                if (!d.project_id) return "";
                                const name = state.projectNameCache[d.project_id] || d.project_id;
                                const isLoaded = isDepLoaded(d);
                                const loadedIconType = type === "Incompatible" ? "warning" : "check_circle";
                                const loadedIconColor = type === "Incompatible" ? "#ff5252" : "#1BD96A";
                                const loadedIcon = isLoaded
                                    ? `<span class="material-symbols-outlined" style="font-size: 14px; margin-left: 4px; color: ${loadedIconColor};" title="Already loaded in MURAD">${loadedIconType}</span>`
                                    : "";
                                let loadedStyle = "";
                                if (isLoaded) {
                                    loadedStyle =
                                        type === "Incompatible"
                                            ? `border-color: rgba(255, 82, 82, 0.4); background: rgba(255, 82, 82, 0.1);`
                                            : `border-color: rgba(27, 217, 106, 0.4); background: rgba(27, 217, 106, 0.1);`;
                                }
                                const tooltipText = isLoaded ? `Already loaded in MURAD!` : `View on Modrinth`;
                                return `<a href="https://modrinth.com/mod/${d.project_id}" target="_blank" class="dep-badge clickable-dep" title="${tooltipText}" style="text-decoration:none; ${loadedStyle}">
                                ${name}${loadedIcon}
                            </a>`;
                            })
                            .join("")}
                    </div>
                </div>
            `;
        };
        const reqHtml = formatApiDeps(reqDeps, "Required", "#ff9800", "error");
        const optHtml = formatApiDeps(optDeps, "Optional", "#448aff", "lightbulb_2");
        const incHtml = formatApiDeps(incDeps, "Incompatible", "#ff5252", "dangerous");
        if (reqHtml || optHtml || incHtml) {
            depsHtml = `
                <div class="dependencies-container">
                    <span class="detail-label" style="display:block; margin-bottom: 8px;">Dependencies</span>
                    ${reqHtml}${optHtml}${incHtml}
                </div>
            `;
        }
    }
    if (mod.apiData && mod.apiData !== "ERROR") {
        const loaderRanges = getLoaderVersionRanges(mod.apiData);
        const loaders = Object.keys(loaderRanges).sort(
            (a, b) => (LOADER_SORT_ORDER[a] || 99) - (LOADER_SORT_ORDER[b] || 99)
        );
        if (loaders.length > 0) {
            rangesHtml = loaders
                .map((l) => {
                    const isIris = l.toLowerCase() === "iris";
                    const iconHtml = LOADER_FILES[l]
                        ? `<img src="${LOADER_FILES[l]}" alt="${capitalize(l)}" class="loader-img" title="${capitalize(l)}">`
                        : `<span class="material-symbols-outlined loader-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;">palette</span>`;
                    const displayName = isIris ? "Iris Shaders" : capitalize(l);
                    return `
                <div class="loader-range-row">
                    ${iconHtml}
                    <span class="loader-name-text"><strong>${displayName}:</strong></span>
                    <div class="range-badges">
                        ${loaderRanges[l].map((rangeText) => `<span class="version-badge">${rangeText}</span>`).join("")}
                    </div>
                </div>
            `;
                })
                .join("");
        } else {
            rangesHtml = '<span class="range-text">No supported versions >= 1.20 found.</span>';
        }
        if (mod.matchedRelease) {
            const rel = mod.matchedRelease;
            const typeLetter = rel.version_type.charAt(0).toUpperCase();
            const typeClass = `type-${rel.version_type}`;
            const highestGV = getHighestVersion([...rel.game_versions]) || rel.game_versions[0];
            const allowedLoaders = ["fabric", "quilt", "forge", "neoforge", "iris", "optifine"];
            const platformHtml = rel.loaders
                .filter((l) => allowedLoaders.includes(l.toLowerCase()))
                .map((l) => {
                    const isIris = l.toLowerCase() === "iris";
                    const isOptifine = l.toLowerCase() === "optifine";
                    const color = LOADER_COLORS[l] || "#448aff";
                    const icon = TINY_LOADER_FILES[l] || "";
                    let textStyle = "";
                    if (isOptifine) {
                        textStyle = `background: linear-gradient(180deg, #FFC526, #DC7722); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold;`;
                    } else if (isIris) {
                        textStyle = `background: linear-gradient(90deg, #E23A3A, #F4691D, #EE7A49, #F2BD2B, #F4B452, #8DD567, #1EB770, #0FAA97, #2FDBB4, #4C63AF, #4C97E0, #8BCDF7, #A481EC, #E4A8E6, #E67D95); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold;`;
                    } else {
                        textStyle = `color: ${color};`;
                    }
                    let iconStyle = "";
                    if (isIris && icon) {
                        iconStyle = `background: url(${icon}) no-repeat center / contain;`;
                    } else if (icon) {
                        let bgRule = isOptifine
                            ? `background: linear-gradient(180deg, #FFC526, #DC7722);`
                            : `background-color: ${color};`;
                        iconStyle = `-webkit-mask: url(${icon}) no-repeat center / contain; mask: url(${icon}) no-repeat center / contain; ${bgRule}`;
                    } else {
                        let bgRule = isOptifine
                            ? `background: linear-gradient(180deg, #FFC526, #DC7722);`
                            : `background-color: ${color};`;
                        iconStyle = `${bgRule} border-radius: 50%; padding: 2px;`;
                    }
                    const displayName = isIris ? "Iris Shaders" : capitalize(l);
                    return `
                        <span class="platform-tag">
                            <span class="platform-icon" style="${iconStyle}"></span>
                            <span style="${textStyle}">${displayName}</span>
                        </span>
                    `;
                })
                .join("");
            const dateObj = new Date(rel.date_published);
            const dateStr = dateObj.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            const timeAgoStr = timeAgo(rel.date_published);
            const dlStr = rel.downloads.toLocaleString();
            const primaryFile = rel.files.find((f) => f.primary) || rel.files[0];
            const directDownloadUrl = primaryFile ? primaryFile.url : "#";
            detailsHtml = `
                <div class="details-top-row">
                    <div class="details-left">
                        <span class="release-type-badge ${typeClass}" title="${capitalize(rel.version_type)}">${typeLetter}</span>
                        <div class="detail-col"><span class="detail-label">Name</span><span class="detail-val">${rel.version_number}<br><span style="font-size: 0.75rem; color: #9aa0a6;">${rel.name}</span></span></div>
                        <div class="detail-col"><span class="detail-label">Game version:</span><span class="detail-val">${highestGV}</span></div>
                        <div class="detail-col"><span class="detail-label">Platform:</span><span class="detail-val">${platformHtml}</span></div>
                        <div class="detail-col"><span class="detail-label">Published</span><span class="detail-val">${dateStr} <span style="color: #9aa0a6;">(${timeAgoStr})</span></span></div>
                        <div class="detail-col"><span class="detail-label">Downloads:</span><span class="detail-val">${dlStr}</span></div>
                    </div>
                    <div class="details-right">
                        <a href="${directDownloadUrl}" class="download-btn"><span class="material-symbols-outlined" style="font-size: 18px;">download</span> Download</a>
                        <a href="https://modrinth.com/mod/${rel.project_id}/version/${rel.id}" target="_blank" class="download-btn" style="background: rgba(255, 255, 255, 0.1); color: #e0e0e0;"><span class="material-symbols-outlined" style="font-size: 18px;">open_in_new</span></a>
                    </div>
                </div>
                ${depsHtml}
            `;
        } else {
            detailsHtml = `<div style="width: 100%; text-align: center; color: #9aa0a6;">No matching version found on Modrinth.</div>`;
        }
    } else if (mod.apiData === "ERROR") {
        rangesHtml = '<span class="range-text">N/A</span>';
        detailsHtml = `<div style="width: 100%; text-align: center; color: #9aa0a6;">Error connecting to Modrinth API.</div>`;
    }
    const safeId = mod.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    let depIconsHtml = "";
    if (hasRequiredDeps) {
        const bgStyle = allReqLoaded
            ? `background: rgba(27, 217, 106, 0.1); border: 1px solid rgba(27, 217, 106, 0.4); padding: 2px 6px; border-radius: 8px;`
            : `padding: 2px 0;`;
        const tick = allReqLoaded
            ? `<span class="material-symbols-outlined" style="font-size: 20px; color: #1BD96A; margin-left: 2px;">check_circle</span>`
            : "";
        depIconsHtml += `<div style="display: flex; align-items: center; cursor: help; ${bgStyle}" title="${allReqLoaded ? "All required mods loaded!" : "Requires other mods"}"><span class="material-symbols-outlined" style="font-size: 20px; color: #ff9800;">error</span>${tick}</div>`;
    }
    if (hasOptionalDeps) {
        const bgStyle = anyOptLoaded
            ? `background: rgba(27, 217, 106, 0.1); border: 1px solid rgba(27, 217, 106, 0.4); padding: 2px 6px; border-radius: 8px;`
            : `padding: 2px 0;`;
        const tick = anyOptLoaded
            ? `<span class="material-symbols-outlined" style="font-size: 20px; color: #1BD96A; margin-left: 2px;">check_circle</span>`
            : "";
        depIconsHtml += `<div style="display: flex; align-items: center; cursor: help; ${bgStyle}" title="${anyOptLoaded ? "Suggested mod(s) loaded!" : "Has suggested mods"}"><span class="material-symbols-outlined" style="font-size: 20px; color: #448aff;">lightbulb_2</span>${tick}</div>`;
    }
    if (hasIncompatibleDeps) {
        const bgStyle = anyIncLoaded
            ? `background: rgba(255, 82, 82, 0.1); border: 1px solid rgba(255, 82, 82, 0.4); padding: 2px 6px; border-radius: 8px;`
            : `padding: 2px 0;`;
        const warn = anyIncLoaded
            ? `<span class="material-symbols-outlined" style="font-size: 20px; color: #ff5252; margin-left: 2px;">warning</span>`
            : "";
        depIconsHtml += `<div style="display: flex; align-items: center; cursor: help; ${bgStyle}" title="${anyIncLoaded ? "WARNING: Incompatible mod is loaded!" : "Has incompatible mods"}"><span class="material-symbols-outlined" style="font-size: 20px; color: #ff5252;">dangerous</span>${warn}</div>`;
    }
    let depIconsContainer =
        depIconsHtml !== ""
            ? `<div style="display: flex; gap: 8px; align-items: center; margin-right: 4px;">${depIconsHtml}</div>`
            : "";
    return `
        <div class="mod-item m3-card" id="mod-${safeId}" style="display: flex; flex-direction: column;">
            <div class="mod-top-row" style="display: flex; justify-content: space-between; width: 100%;">
                <div class="mod-info">
                    <div class="mod-header"><strong>${mod.name}</strong></div>
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

export function updateLoaderButtons() {
    const currentVersion = state.selectedTargetVersions[0];
    if (!currentVersion) return;

    const validMods = state.scannedMods.filter((m) => m.apiData && m.apiData !== "ERROR");
    const totalValidMods = validMods.length;
    const loaders = ["fabric", "quilt", "neoforge", "forge"];
    
    loaders.forEach((loader) => {
        const btn = document.getElementById(`btn-ldr-${loader}`);
        if (!btn) return;
        
        const displayTitle = loader === "neoforge" ? "NeoForge" : capitalize(loader);

        if (totalValidMods === 0) {
            btn.innerHTML = `<img src="icons/${loader}.svg" alt="${displayTitle}" class="btn-loader-icon"> <span>${displayTitle}</span>`;
            return;
        }
        
        let compCount = validMods.filter((m) => {
            if (m.project_type === "resourcepack" || m.project_type === "shader") {
                return m.apiData.some(r => r.game_versions.includes(currentVersion));
            } else {
                let filteredData = m.apiData.filter(r => r.loaders.includes(loader));
                return filteredData.some(r => r.game_versions.includes(currentVersion));
            }
        }).length;
        
        const pct = Math.round((compCount / totalValidMods) * 100);
        
        let pctClass = "";
        if (pct === 100) pctClass = "pct-green";
        else if (pct >= 75) pctClass = "pct-green";
        else if (pct >= 50) pctClass = "pct-yellow";
        else if (pct >= 25) pctClass = "pct-orange";
        else pctClass = "pct-red";
        
        btn.innerHTML = `<img src="icons/${loader}.svg" alt="${displayTitle}" class="btn-loader-icon"> <span>${displayTitle}</span> <span class="pct ${pctClass}">${pct}%</span>`;
    });
}