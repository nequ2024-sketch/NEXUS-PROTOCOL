// اختبارات SignalRegistry بالعربية: تفويض الناشر وتسجيل التنفيذ مرة واحدة.
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SignalRegistry", function () {
  async function deployRegistry() {
    const [owner, publisher, outsider] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("SignalRegistry");
    const registry = await Registry.deploy();
    return { registry, owner, publisher, outsider };
  }

  it("publishes and reads a signal, then records one publisher execution", async function () {
    const { registry, publisher } = await deployRegistry();
    await registry.authorizePublisher(publisher.address, true);
    const hash = ethers.keccak256(ethers.toUtf8Bytes("BTC/USDT|BUY|50000"));
    await expect(registry.connect(publisher).publishSignal(hash, "BTC/USDT", "BUY", 50_000))
      .to.emit(registry, "SignalPublished").withArgs(1, hash, "BTC/USDT", "BUY", 50_000, publisher.address);
    await registry.connect(publisher).recordExecution(1, 125);
    const signal = await registry.getSignal(1);
    expect(signal.executed).to.equal(true);
    expect(signal.pnlBps).to.equal(125);
    await expect(registry.connect(publisher).recordExecution(1, 130)).to.be.revertedWith("SignalRegistry: already executed");
  });

  it("rejects unauthorized publishers, empty hashes, and executions by another publisher", async function () {
    const { registry, publisher, outsider } = await deployRegistry();
    await expect(registry.connect(publisher).publishSignal(ethers.ZeroHash, "BTC/USDT", "BUY", 1))
      .to.be.revertedWith("SignalRegistry: not authorized publisher");
    await registry.authorizePublisher(publisher.address, true);
    await expect(registry.connect(publisher).publishSignal(ethers.ZeroHash, "BTC/USDT", "BUY", 1))
      .to.be.revertedWith("SignalRegistry: empty hash");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("signal"));
    await registry.connect(publisher).publishSignal(hash, "BTC/USDT", "BUY", 1);
    await registry.authorizePublisher(outsider.address, true);
    await expect(registry.connect(outsider).recordExecution(1, 1))
      .to.be.revertedWith("SignalRegistry: not signal publisher");
  });
});
