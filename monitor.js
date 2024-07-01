const fs = require("fs");
const path = require("path");
const os = require("os");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const si = require("systeminformation");

const {
  loadProgress,
  getLatestLogFile,
} = require("./monitor_components/helperFunctions");

const { createDiskGauge } = require("./monitor_components/diskGauge");
const { createMemGauge } = require("./monitor_components/memGauge");
const { createCpuLine } = require("./monitor_components/cpuLine");
const { createNetworkLine } = require("./monitor_components/networkLine");
const { createStateDlGauge } = require("./monitor_components/stateDlGauge");
const { createHeaderDlGauge } = require("./monitor_components/headerDlGauge");
const { createChainDlGauge } = require("./monitor_components/chainDlGauge");
const { createPeerCountLcd } = require("./monitor_components/peerCountLcd");

const { createExecutionLog } = require("./monitor_components/executionLog");

const {
  setupLogStreaming,
} = require("./monitor_components/updateLogicExecution");

const {
  createConsensusLog,
  setupLogStreamingConsensus,
} = require("./monitor_components/consensusLog");


const CONFIG = {
  installDir: os.homedir(),
  executionClient: 'geth',
  consensusClient: 'prysm',
  logDirs: {
    geth: path.join(os.homedir(), "bgnode", "geth", "logs"),
    prysm: path.join(os.homedir(), "bgnode", "prysm", "logs"),
  },
  debugLogPath: path.join(os.homedir(), "bgnode", "debugMonitor.log"),
};

function initializeMonitoring() {
  try {
    // setupDebugLogging(CONFIG.debugLogPath);
    
    const progress = loadProgress();

    const { screen, components } = setupUI(progress);

    const logFilePath = path.join(CONFIG.logDirs.geth, getLatestLogFile(CONFIG.logDirs.geth, CONFIG.executionClient));
    const logFilePathConsensus = path.join(CONFIG.logDirs.prysm, getLatestLogFile(CONFIG.logDirs.prysm, CONFIG.consensusClient));

    console.log(`Monitoring ${CONFIG.executionClient} logs from: ${logFilePath}`);
    console.log(`Monitoring ${CONFIG.consensusClient} logs from: ${logFilePathConsensus}`);

    setupLogStreaming(
      logFilePath,
      components.executionLog,
      screen,
      components.headerDlGauge,
      components.stateDlGauge,
      components.chainDlGauge,
      components.peerCountGauge
    );

    setupLogStreamingConsensus(logFilePathConsensus, components.consensusLog, screen);
  } catch (error) {
    console.error("Error initializing monitoring:", error);
  }
}

function setupDebugLogging(debugLogPath) {
  if (fs.existsSync(debugLogPath)) {
    fs.unlinkSync(debugLogPath);
  }

  function logDebug(message) {
    if (typeof message === "object") {
      message = JSON.stringify(message, null, 2);
    }
    fs.appendFileSync(
      debugLogPath,
      `[${new Date().toISOString()}] ${message}\n`
    );
  }

  console.log = function (message, ...optionalParams) {
    if (optionalParams.length > 0) {
      message +=
        " " +
        optionalParams
          .map((param) =>
            typeof param === "object" ? JSON.stringify(param, null, 2) : param
          )
          .join(" ");
    }
    logDebug(message);
  };
}

function setupUI(progress) {
  const screen = blessed.screen();
  suppressMouseOutput(screen);
  const grid = new contrib.grid({ rows: 8, cols: 10, screen: screen });

  const executionLog = createExecutionLog(grid);
  const consensusLog = createConsensusLog(grid);
  const peerCountGauge = createPeerCountLcd(grid, screen);
  const storageGauge = createDiskGauge(grid, screen);
  const memGauge = createMemGauge(grid, screen);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const headerDlGauge = createHeaderDlGauge(grid);
  const stateDlGauge = createStateDlGauge(grid);
  const chainDlGauge = createChainDlGauge(grid);

  screen.append(executionLog);
  screen.append(consensusLog);
  screen.append(peerCountGauge);
  screen.append(cpuLine);
  screen.append(networkLine);
  screen.append(memGauge);
  screen.append(storageGauge);
  screen.append(headerDlGauge);
  screen.append(stateDlGauge);
  screen.append(chainDlGauge);

  peerCountGauge.setDisplay("0");

  if (progress) {
    headerDlGauge.setPercent(progress.headerDlProgress);
    stateDlGauge.setPercent(progress.stateDlProgress);
    chainDlGauge.setPercent(progress.chainDlProgress);
  }

  screen.render();

  screen.key(["escape", "q", "C-c"], function (ch, key) {
    process.kill(process.pid, 'SIGUSR2');
    screen.destroy();
  });

  return {
    screen,
    components: {
      executionLog,
      consensusLog,
      peerCountGauge,
      headerDlGauge,
      stateDlGauge,
      chainDlGauge
    },
  };
}

module.exports = { initializeMonitoring, setupDebugLogging };

function suppressMouseOutput(screen) {
  screen.on("element mouse", (el, data) => {
    if (data.button === "mouseup" || data.button === "mousedown") {
      return false; // Suppress mouse up/down events
    }
  });

  screen.on("keypress", (ch, key) => {
    if (
      key.name === "up" ||
      key.name === "down" ||
      key.name === "left" ||
      key.name === "right"
    ) {
      if (!key.ctrl && !key.meta && !key.shift) {
        return false; // Suppress arrow key events unless combined with Ctrl, Meta, or Shift
      }
    }
  });
}
