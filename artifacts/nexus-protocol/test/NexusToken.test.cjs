// اختبارات NexusToken بالعربية: العرض والرسوم والصلاحيات.
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NexusToken", function () {
  async function deployToken() {
    const [owner, treasury, alice, bob] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("NexusToken");
    const token = await Token.deploy(treasury.address);
    return { token, owner, treasury, alice, bob };
  }

  it("mints the fixed maximum supply to the owner", async function () {
    const { token, owner } = await deployToken();
    expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000000"));
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000000"));
  });

  it("caps both fees at 500 basis points and charges treasury and burn", async function () {
    const { token, owner, treasury, alice, bob } = await deployToken();
    await token.setFees(500, 500);
    await token.transfer(alice.address, ethers.parseEther("1000"));
    await token.connect(alice).transfer(bob.address, ethers.parseEther("100"));
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("90"));
    expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther("5"));
    expect(await token.totalSupply()).to.equal(ethers.parseEther("999999995"));
    await expect(token.setFees(501, 0)).to.be.revertedWith("NexusToken: burn fee too high");
    await expect(token.setFees(0, 501)).to.be.revertedWith("NexusToken: treasury fee too high");
    await expect(token.connect(alice).setFees(0, 0)).to.be.reverted;
    expect(owner.address).to.not.equal(ethers.ZeroAddress);
  });

  it("does not charge fees on an excluded transfer", async function () {
    const { token, alice, bob } = await deployToken();
    await token.setFees(200, 300);
    await token.transfer(alice.address, ethers.parseEther("100"));
    await token.excludeFromFee(alice.address, true);
    await token.connect(alice).transfer(bob.address, ethers.parseEther("10"));
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("10"));
  });
});
