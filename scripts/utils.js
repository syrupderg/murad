export const state = {
    selectedLoader: null,
    selectedTargetVersions: [],
    scannedMods: [],
    rawMcVersions: [],
    mcVersionsCache: [],
    includeSnapshots: false, 
    currentSortMode: "COMP",
    nameSortDir: 1,
    compSortDir: 1,
    catSortDirs: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
    catCollapsed: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false },
    searchQuery: "",
    pendingOverrideDataStr: "",
    pendingOverrideFileName: "",
    projectNameCache: {},
    projectSlugCache: {}
};

export const PRIORITY = { GREEN: 1, YELLOW: 2, RED: 3, NOT_FOUND: 4, CHECKING: 5, RESOURCE_PACK: 6, SHADER: 7, DATA_PACK: 8 };

export const PRIORITY_NAMES = {
    1: "Compatible",
    2: "Kinda Compatible",
    3: "Incompatible",
    4: "Not Found",
    5: "Checking / Errors",
    6: "Resource Packs",
    7: "Shaders",
    8: "Data Packs",
};

export const LOADER_FILES = {
    fabric: "icons/fabric.svg",
    quilt: "icons/quilt.svg",
    forge: "icons/forge.svg",
    neoforge: "icons/neoforge.svg",
    optifine: "icons/optifine.svg",
    iris: "icons/iris.svg",
    resourcepack: "icons/resource-pack.svg",
    datapack: "icons/data-pack.svg",
};

export const TINY_LOADER_FILES = {
    fabric: "icons/fabric-tiny.svg",
    quilt: "icons/quilt-tiny.svg",
    forge: "icons/forge-tiny.svg",
    neoforge: "icons/neoforge-tiny.svg",
    optifine: "icons/optifine-tiny.svg",
    iris: "icons/iris-tiny.svg",
    resourcepack: "icons/resource-pack-tiny.svg",
    datapack: "icons/data-pack-tiny.svg",
};

export const LOADER_COLORS = {
    fabric: "#dbb69b",
    quilt: "#c796f9",
    neoforge: "#f99e6b",
    forge: "#959eef",
    optifine: "#FFC526",
    iris: "#448aff",
    resourcepack: "#1BD96A", 
    datapack: "#4FC3F7",
};

export const LOADER_SORT_ORDER = {
    fabric: 1,
    quilt: 2,
    neoforge: 3,
    forge: 4,
    iris: 5,
    optifine: 6,
    resourcepack: 7,
};

export function isVersionAllowed(v) {
    let isSnapshot = !/^\d+\.\d+(\.\d+)?$/.test(v);

    if (!state.includeSnapshots && isSnapshot) return false;

    return true;
}

export function isValidRelease(v) {
    return /^\d+\.\d+(\.\d+)?$/.test(v);
}

export function parseVersion(v) {
    let parts = v.split(/[\.w-]/).filter(p => p !== "").map(p => parseInt(p) || 0);
    return { original: v, maj: parts[0] || 0, min: parts[1] || 0, pat: parts[2] || 0 };
}

export function isAtLeast1_20(v) {
    let p = parseVersion(v);
    if (p.maj > 1) return true;
    if (p.maj === 1 && p.min >= 20) return true;
    return false;
}

export function timeAgo(dateString) {
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

export async function getFileHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getHighestVersion(versionsArray) {
    if (!versionsArray || versionsArray.length === 0) return null;
    return versionsArray.sort((a, b) => {
        let pA = a.split(".").map(Number),
            pB = b.split(".").map(Number);
        for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
            let nA = pA[i] || 0,
                nB = pB[i] || 0;
            if (nA !== nB) return nB - nA;
        }
        return 0;
    })[0];
}

export function getGroupForVersion(v) {
    if (!v) return "Other Versions";

    const stableGroups = {
        "26.3": "Release 26.3",
        "26.2": "Release 26.2",
        "26.1.2": "Release 26.1", "26.1.1": "Release 26.1", "26.1": "Release 26.1",
        "1.21.11": "Release 1.21.11",
        "1.21.10": "Release 1.21.9 & 1.21.10", "1.21.9": "Release 1.21.9 & 1.21.10",
        "1.21.8": "Release 1.21.7 & 1.21.8", "1.21.7": "Release 1.21.7 & 1.21.8",
        "1.21.6": "Release 1.21.6",
        "1.21.5": "Release 1.21.5",
        "1.21.4": "Release 1.21.4",
        "1.21.3": "Release 1.21.2 & 1.21.3", "1.21.2": "Release 1.21.2 & 1.21.3",
        "1.21.1": "Release 1.21 & 1.21.1", "1.21": "Release 1.21 & 1.21.1",
        "1.20.6": "Release 1.20.5 & 1.20.6", "1.20.5": "Release 1.20.5 & 1.20.6",
        "1.20.4": "Release 1.20.3 & 1.20.4", "1.20.3": "Release 1.20.3 & 1.20.4",
        "1.20.2": "Release 1.20.2",
        "1.20.1": "Release 1.20 & 1.20.1", "1.20": "Release 1.20 & 1.20.1",
        "1.19.4": "Release 1.19.4",
        "1.19.3": "Release 1.19.3",
        "1.19.2": "Release 1.19.1 & 1.19.2", "1.19.1": "Release 1.19.1 & 1.19.2",
        "1.19": "Release 1.19",
        "1.18.2": "Release 1.18.2",
        "1.18.1": "Release 1.18 & 1.18.1", "1.18": "Release 1.18 & 1.18.1",
        "1.17.1": "Release 1.17.1",
        "1.17": "Release 1.17",
        "1.16.5": "Release 1.16.4 & 1.16.5", "1.16.4": "Release 1.16.4 & 1.16.5",
        "1.16.3": "Release 1.16.2 & 1.16.3", "1.16.2": "Release 1.16.2 & 1.16.3",
        "1.16.1": "Release 1.16 & 1.16.1", "1.16": "Release 1.16 & 1.16.1",
        "1.15.2": "Release 1.15.2",
        "1.15.1": "Release 1.15 & 1.15.1", "1.15": "Release 1.15 & 1.15.1",
        "1.14.4": "Release 1.14.4",
        "1.14.3": "Release 1.14.3",
        "1.14.2": "Release 1.14.1 & 1.14.2", "1.14.1": "Release 1.14.1 & 1.14.2",
        "1.14": "Release 1.14",
        "1.13.2": "Release 1.13.2",
        "1.13.1": "Release 1.13.1",
        "1.13": "Release 1.13",
        "1.12.2": "Release 1.12", "1.12.1": "Release 1.12", "1.12": "Release 1.12",
        "1.11.2": "Release 1.11.1 & 1.11.2", "1.11.1": "Release 1.11.1 & 1.11.2",
        "1.11": "Release 1.11",
        "1.10.2": "Release 1.10", "1.10.1": "Release 1.10", "1.10": "Release 1.10",
        "1.9.4": "Release 1.9.3 & 1.9.4", "1.9.3": "Release 1.9.3 & 1.9.4",
        "1.9.2": "Release 1.9.1 & 1.9.2", "1.9.1": "Release 1.9.1 & 1.9.2",
        "1.9": "Release 1.9",
        "1.8.9": "Release 1.8.8 & 1.8.9", "1.8.8": "Release 1.8.8 & 1.8.9",
        "1.8.7": "Release 1.8.2 to 1.8.7", "1.8.6": "Release 1.8.2 to 1.8.7", "1.8.5": "Release 1.8.2 to 1.8.7", "1.8.4": "Release 1.8.2 to 1.8.7", "1.8.3": "Release 1.8.2 to 1.8.7", "1.8.2": "Release 1.8.2 to 1.8.7",
        "1.8.1": "Release 1.8 & 1.8.1", "1.8": "Release 1.8 & 1.8.1",
        "1.7.10": "Release 1.7.10",
        "1.7.9": "Release 1.7.6 to 1.7.9", "1.7.8": "Release 1.7.6 to 1.7.9", "1.7.7": "Release 1.7.6 to 1.7.9", "1.7.6": "Release 1.7.6 to 1.7.9",
        "1.7.5": "Release 1.7.4 & 1.7.5", "1.7.4": "Release 1.7.4 & 1.7.5",
        "1.7.3": "Release 1.7.2 & 1.7.3", "1.7.2": "Release 1.7.2 & 1.7.3",
        "1.6.4": "Release 1.6.4",
        "1.6.2": "Release 1.6.1 & 1.6.2", "1.6.1": "Release 1.6.1 & 1.6.2",
        "1.5.2": "Release 1.5.1 & 1.5.2", "1.5.1": "Release 1.5.1 & 1.5.2",
        "1.4.7": "Release 1.4.6 & 1.4.7", "1.4.6": "Release 1.4.6 & 1.4.7",
        "1.4.5": "Release 1.4.4 & 1.4.5", "1.4.4": "Release 1.4.4 & 1.4.5",
        "1.4.2": "Release 1.4.2",
        "1.3.2": "Release 1.3", "1.3.1": "Release 1.3",
        "1.2.5": "Release 1.2", "1.2.4": "Release 1.2", "1.2.3": "Release 1.2", "1.2.2": "Release 1.2", "1.2.1": "Release 1.2",
        "1.1": "Release 1.1",
        "1.0": "Release 1.0"
    };

    if (stableGroups[v]) return stableGroups[v];

    if (v.includes("-rc") || v.includes("-pre") || v.includes("-snapshot") || v.includes(" Pre-Release")) {
        if (!state.includeSnapshots) return false;
        let baseVersion = v.split(/-| Pre-Release/)[0].trim();
        if (stableGroups[baseVersion]) return stableGroups[baseVersion];
    }

    if (/^\d{2}w\d{2}[a-z]$/.test(v) || v.includes("potato") || v.includes("craftmine") || v.includes("infinite") || v.includes("oneblockatatime") || v.includes("or_b")) {
        if (!state.includeSnapshots) return false;
        let year = parseInt(v.substring(0, 2));
        let week = parseInt(v.substring(3, 5)) || 0;

        if (year === 26) {
            if (week >= 14) return "Release 26.2";
            return "Release 26.1";
        }
        if (year === 25) {
            if (week >= 41) return "Release 1.21.11";
            if (week >= 31) return "Release 1.21.9 & 1.21.10";
            if (week >= 15 || v.includes("craftmine")) return "Release 1.21.6";
            return "Release 1.21.5";
        }
        if (year === 24) {
            if (week >= 44) return "Release 1.21.4";
            if (week >= 33) return "Release 1.21.2 & 1.21.3";
            if (week >= 18) return "Release 1.21 & 1.21.1";
            if (week >= 3 || v.includes("potato")) return "Release 1.20.5 & 1.20.6";
        }
        if (year === 23) {
            if (week >= 51) return "Release 1.20.5 & 1.20.6";
            if (week >= 40) return "Release 1.20.3 & 1.20.4";
            if (week >= 31) return "Release 1.20.2";
            if (week >= 12 || v.includes("or_b")) return "Release 1.20 & 1.20.1";
            return "Release 1.19.4";
        }
        if (year === 22) {
            if (week >= 46) return "Release 1.19.3";
            if (week >= 24) return "Release 1.19.1 & 1.19.2";
            if (week >= 11 || v.includes("oneblockatatime")) return "Release 1.19";
            return "Release 1.18.2";
        }
        if (year === 21) {
            if (week >= 37) return "Release 1.18 & 1.18.1";
            return "Release 1.17";
        }
        if (year === 20) {
            if (week >= 45) return "Release 1.17";
            if (week >= 27) return "Release 1.16.2 & 1.16.3";
            if (week >= 6 || v.includes("infinite")) return "Release 1.16 & 1.16.1";
        }
        if (year === 19) {
            if (week >= 34) return "Release 1.15 & 1.15.1";
            return "Release 1.14";
        }
        if (year === 18) {
            if (week >= 43) return "Release 1.14";
            if (week >= 30) return "Release 1.13.1";
            return "Release 1.13";
        }
        if (year === 17) {
            if (week >= 43) return "Release 1.13";
            if (week >= 31) return "Release 1.12"; 
            if (week >= 6) return "Release 1.12";
        }
        if (year === 16) {
            if (week >= 50) return "Release 1.11.1 & 1.11.2";
            if (week >= 32) return "Release 1.11";
            if (week >= 20) return "Release 1.10";
            if (week >= 14) return "Release 1.9.3 & 1.9.4";
            return "Release 1.9";
        }
        if (year === 15) {
            if (week >= 14) return "Release 1.9";
        }
        if (year === 14) {
            return "Release 1.8 & 1.8.1";
        }
        if (year === 13) {
            if (week >= 36) return "Release 1.8 & 1.8.1";
            return "Release 1.6.1 & 1.6.2";
        }
    }

    if (v === "1.7" || v === "1.7.1") return "Release 1.7.2 & 1.7.3";
    if (v === "1.6" || v === "1.6.3") return v === "1.6.3" ? "Release 1.6.4" : "Release 1.6.1 & 1.6.2";
    if (v === "1.5") return "Release 1.5.1 & 1.5.2";
    if (v === "1.4" || v === "1.4.1" || v === "1.4.3") return "Release 1.4.2";
    if (v === "1.3") return "Release 1.3";
    if (v === "3D Shareware v1.34") return "Release 1.14";
    if (v === "1.RV-Pre1") return "Release 1.9";

    let fallbackMatch = v.match(/^1\.(\d+)/);
    if (fallbackMatch) return `Release 1.${fallbackMatch[1]}`;

    return "Other Versions";
}

export function isConsecutiveVersion(baseA, baseB) {
    if (baseA === "26.3" && baseB === "1.21") return true;
    if (baseA === "26.2" && baseB === "1.21") return true;
    if (baseA === "26.1" && baseB === "1.21") return true; 
    
    let partsA = baseA.split('.').map(Number);
    let partsB = baseB.split('.').map(Number);
    if (partsA[0] === partsB[0]) {
        return partsA[1] - partsB[1] === 1; 
    }
    return false;
}

export function getLoaderVersionRanges(apiData, projectType = "mod") {
    if (!apiData || apiData === "ERROR" || apiData.length === 0) return {};
    let loaderVersions = {};
    const allowedLoaders = ["fabric", "quilt", "forge", "neoforge", "iris", "optifine"];
    
    apiData.forEach((release) => {
        if (projectType === "resourcepack" || projectType === "datapack") {
            if (!loaderVersions[projectType]) loaderVersions[projectType] = new Set();
            release.game_versions.forEach((v) => {
                if (isVersionAllowed(v)) {
                    loaderVersions[projectType].add(v);
                }
            });
        } else {
            release.loaders.forEach((l) => {
                const safeLoader = l.toLowerCase();
                if (!allowedLoaders.includes(safeLoader)) return;
                if (!loaderVersions[safeLoader]) loaderVersions[safeLoader] = new Set();
                
                release.game_versions.forEach((v) => {
                    if (isVersionAllowed(v)) {
                        loaderVersions[safeLoader].add(v);
                    }
                });
            });
        }
    });

    let ranges = {};
    for (let l in loaderVersions) {
        if (loaderVersions[l].size > 0) {
            const versions = Array.from(loaderVersions[l]);
            const parsed = versions.map(v => {
                const parts = v.split('.');
                return {
                    original: v,
                    maj: parseInt(parts[0]) || 0,
                    min: parseInt(parts[1]) || 0,
                    pat: parseInt(parts[2]) || 0
                };
            });
            
            const groups = {};
            parsed.forEach(p => {
                const key = `${p.maj}.${p.min}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(p.pat);
            });

            const allRanges = [];
            const sortedKeys = Object.keys(groups).sort((a, b) => {
                const [aMaj, aMin] = a.split('.').map(Number);
                const [bMaj, bMin] = b.split('.').map(Number);
                if (aMaj !== bMaj) return bMaj - aMaj;
                return bMin - aMin;
            });

            sortedKeys.forEach(key => {
                const patches = [...new Set(groups[key])].sort((a, b) => a - b);
                let start = patches[0];
                let prev = patches[0];
                
                const subRanges = [];
                for (let i = 1; i < patches.length; i++) {
                    if (patches[i] === prev + 1) {
                        prev = patches[i];
                    } else {
                        subRanges.push({ start, end: prev });
                        start = patches[i];
                        prev = patches[i];
                    }
                }
                subRanges.push({ start, end: prev });
                
                subRanges.forEach(r => {
                    if (r.start === r.end) {
                        allRanges.push(r.start === 0 ? key : `${key}.${r.start}`);
                    } else if (r.start === 0 || r.start === 1) {
                        allRanges.push(`${key}.x`);
                    } else {
                        allRanges.push(`${key}.${r.start}–${key}.${r.end}`);
                    }
                });
            });

            const compressedRanges = [];
            let i = 0;
            while (i < allRanges.length) {
                if (allRanges[i].endsWith('.x')) {
                    let j = i + 1;
                    while (j < allRanges.length && allRanges[j].endsWith('.x')) {
                        let basePrev = allRanges[j-1].replace('.x', '');
                        let baseCurr = allRanges[j].replace('.x', '');
                        
                        if (isConsecutiveVersion(basePrev, baseCurr)) {
                            j++;
                        } else {
                            break;
                        }
                    }
                    if (j - i > 1) {
                        compressedRanges.push(`${allRanges[i]}–${allRanges[j-1]}`);
                        i = j;
                        continue;
                    }
                }
                compressedRanges.push(allRanges[i]);
                i++;
            }

            ranges[l] = compressedRanges;
        }
    }
    return ranges;
}

export async function extractTarArchive(file) {
    let buffer;
    if (file.name.endsWith(".gz") || file.name.endsWith(".tgz")) {
        const ds = new DecompressionStream("gzip");
        const stream = file.stream().pipeThrough(ds);
        const response = new Response(stream);
        buffer = await response.arrayBuffer();
    } else {
        buffer = await file.arrayBuffer();
    }
    const files = [];
    let offset = 0;
    const uint8 = new Uint8Array(buffer);
    const decoder = new TextDecoder("utf-8");
    while (offset < uint8.length - 512) {
        const header = uint8.subarray(offset, offset + 512);
        if (header[0] === 0) break;
        const nameBytes = header.subarray(0, 100);
        let nameLen = 0;
        while (nameLen < 100 && nameBytes[nameLen] !== 0) nameLen++;
        const name = decoder.decode(nameBytes.subarray(0, nameLen));
        const sizeBytes = header.subarray(124, 136);
        let sizeStr = decoder.decode(sizeBytes).replace(/\0/g, "").trim();
        const size = parseInt(sizeStr, 8) || 0;
        const typeflag = String.fromCharCode(header[156]);
        const isFile = typeflag === "0" || typeflag === "\0";
        offset += 512;
        if (isFile && size > 0 && (name.endsWith(".jar") || name.endsWith(".zip"))) {
            const fileData = uint8.subarray(offset, offset + size);
            const blob = new Blob([fileData]);
            blob.name = name.split("/").pop();
            files.push(blob);
        }
        offset += Math.ceil(size / 512) * 512;
    }
    return files;
}