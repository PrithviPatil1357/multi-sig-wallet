import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { MetaMultiSigWallet } from "../typechain-types"; // Adjust if typechain output path differs
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, parseEther, AbiCoder } from "ethers";

describe("MetaMultiSigWallet", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployMetaMultiSigWalletFixture() {
    // Get signers
    const [owner1, owner2, owner3, nonOwner] = await ethers.getSigners();
    const owners = [owner1.address, owner2.address, owner3.address].sort((a, b) => (BigInt(a) > BigInt(b) ? 1 : -1)); // Keep owners sorted for consistent hashing/recovery checks
    const signaturesRequired = 2;

    // Get chainId
    const { chainId } = await ethers.provider.getNetwork();

    // Deploy the contract
    const MetaMultiSigWalletFactory = await ethers.getContractFactory("MetaMultiSigWallet");
    const metaMultiSigWallet = (await MetaMultiSigWalletFactory.deploy(
      chainId,
      owners,
      signaturesRequired,
    )) as MetaMultiSigWallet;
    await metaMultiSigWallet.waitForDeployment();
    const contractAddress = await metaMultiSigWallet.getAddress();

    // Helper function to get transaction hash
    const getTransactionHash = async (_nonce: bigint, to: string, value: bigint, data: string) => {
      return metaMultiSigWallet.getTransactionHash(_nonce, to, value, data);
    };

    // Helper function to sign a hash
    const signTransactionHash = async (signer: SignerWithAddress, hash: string) => {
      const messageHashBytes = ethers.getBytes(hash);
      const signature = await signer.signMessage(messageHashBytes);
      return signature;
    };

    return {
      metaMultiSigWallet,
      contractAddress,
      owner1,
      owner2,
      owner3,
      owners,
      nonOwner,
      signaturesRequired,
      chainId,
      getTransactionHash,
      signTransactionHash,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct owners and signaturesRequired", async function () {
      const { metaMultiSigWallet, owners, signaturesRequired } = await loadFixture(deployMetaMultiSigWalletFixture);
      for (const owner of owners) {
        expect(await metaMultiSigWallet.isOwner(owner)).to.be.true;
      }
      expect(await metaMultiSigWallet.signaturesRequired()).to.equal(signaturesRequired);
    });

    it("Should set the correct chainId", async function () {
      const { metaMultiSigWallet, chainId } = await loadFixture(deployMetaMultiSigWalletFixture);
      expect(await metaMultiSigWallet.chainId()).to.equal(chainId);
    });

    it("Should have nonce starting at 0", async function () {
      const { metaMultiSigWallet } = await loadFixture(deployMetaMultiSigWalletFixture);
      expect(await metaMultiSigWallet.nonce()).to.equal(0);
    });
  });

  describe("Transactions Execution (ETH Transfer)", function () {
    it("Should execute ETH transfer with enough valid signatures", async function () {
      const { metaMultiSigWallet, contractAddress, owner1, owner2, nonOwner, getTransactionHash, signTransactionHash } =
        await loadFixture(deployMetaMultiSigWalletFixture);

      // Fund the multisig wallet
      const initialBalance = parseEther("1.0");
      await owner1.sendTransaction({ to: contractAddress, value: initialBalance });
      expect(await ethers.provider.getBalance(contractAddress)).to.equal(initialBalance);

      const currentNonce = await metaMultiSigWallet.nonce();
      const to = nonOwner.address;
      const value = parseEther("0.5");
      const data = "0x";

      // 1. Get the hash
      const txHash = await getTransactionHash(currentNonce, to, value, data);

      // 2. Sign the hash by required owners (owner1, owner2)
      const sig1 = await signTransactionHash(owner1, txHash);
      const sig2 = await signTransactionHash(owner2, txHash);

      // Create pairs, sort by signer, extract signatures
      const signatures = [
        { signer: owner1.address, signature: sig1 },
        { signer: owner2.address, signature: sig2 },
      ];
      signatures.sort((a, b) => (BigInt(a.signer) > BigInt(b.signer) ? 1 : -1));
      const sortedSignatures = signatures.map(s => s.signature);

      const nonOwnerInitialBalance = await ethers.provider.getBalance(nonOwner.address);

      // 3. Execute the transaction (owner1 executes)
      const tx = await metaMultiSigWallet.connect(owner1).executeTransaction(to, value, data, sortedSignatures);
      const receipt = await tx.wait();

      // Check balances
      const expectedMultisigBalance = initialBalance - value;
      expect(await ethers.provider.getBalance(contractAddress)).to.equal(expectedMultisigBalance);
      const expectedNonOwnerBalance = nonOwnerInitialBalance + value;
      expect(await ethers.provider.getBalance(nonOwner.address)).to.equal(expectedNonOwnerBalance);

      // Check nonce increment
      expect(await metaMultiSigWallet.nonce()).to.equal(currentNonce + 1n);

      // Check event emission
      await expect(tx)
        .to.emit(metaMultiSigWallet, "ExecuteTransaction")
        // Check the decoded event arguments. For ETH transfer to EOA, result is empty bytes ('0x')
        .withArgs(owner1.address, to, value, data, currentNonce, txHash, "0x");
    });

    it("Should fail ETH transfer if not enough signatures are provided", async function () {
      const { metaMultiSigWallet, contractAddress, owner1, nonOwner, getTransactionHash, signTransactionHash } =
        await loadFixture(deployMetaMultiSigWalletFixture);
      await owner1.sendTransaction({ to: contractAddress, value: parseEther("1.0") });

      const currentNonce = await metaMultiSigWallet.nonce();
      const to = nonOwner.address;
      const value = parseEther("0.5");
      const data = "0x";

      const txHash = await getTransactionHash(currentNonce, to, value, data);
      const sig1 = await signTransactionHash(owner1, txHash);

      // Only provide one signature when two are required
      await expect(metaMultiSigWallet.connect(owner1).executeTransaction(to, value, data, [sig1])).to.be.revertedWith(
        "executeTransaction: not enough valid signatures",
      );
      // Ensure nonce did not increment
      expect(await metaMultiSigWallet.nonce()).to.equal(currentNonce);
    });

    it("Should fail ETH transfer if signature from non-owner is provided", async function () {
      const { metaMultiSigWallet, contractAddress, owner1, owner2, nonOwner, getTransactionHash, signTransactionHash } =
        await loadFixture(deployMetaMultiSigWalletFixture);
      await owner1.sendTransaction({ to: contractAddress, value: parseEther("1.0") });

      const currentNonce = await metaMultiSigWallet.nonce();
      const to = nonOwner.address; // Sending to self for simplicity
      const value = parseEther("0.5");
      const data = "0x";

      const txHash = await getTransactionHash(currentNonce, to, value, data);
      const sig1 = await signTransactionHash(owner1, txHash);
      const sigNonOwner = await signTransactionHash(nonOwner, txHash);

      // Create pairs, sort by signer, extract signatures
      const signaturesWithNonOwner = [
        { signer: owner1.address, signature: sig1 },
        { signer: nonOwner.address, signature: sigNonOwner },
      ];
      signaturesWithNonOwner.sort((a, b) => (BigInt(a.signer) > BigInt(b.signer) ? 1 : -1));
      const sortedSignatures = signaturesWithNonOwner.map(s => s.signature);

      await expect(
        metaMultiSigWallet.connect(owner1).executeTransaction(to, value, data, sortedSignatures),
      ).to.be.revertedWith("executeTransaction: not enough valid signatures"); // Still reverts, as non-owner sig is ignored
      expect(await metaMultiSigWallet.nonce()).to.equal(currentNonce);
    });

    it("Should fail ETH transfer if signatures are duplicated or not sorted", async function () {
      const { metaMultiSigWallet, contractAddress, owner1, owner2, nonOwner, getTransactionHash, signTransactionHash } =
        await loadFixture(deployMetaMultiSigWalletFixture);
      await owner1.sendTransaction({ to: contractAddress, value: parseEther("1.0") });

      const currentNonce = await metaMultiSigWallet.nonce();
      const to = nonOwner.address;
      const value = parseEther("0.5");
      const data = "0x";

      const txHash = await getTransactionHash(currentNonce, to, value, data);
      const sig1 = await signTransactionHash(owner1, txHash);
      const sig2 = await signTransactionHash(owner2, txHash);

      // Test unsorted signatures directly
      const unsortedSignatures = BigInt(owner1.address) > BigInt(owner2.address) ? [sig1, sig2] : [sig2, sig1];
      await expect(
        metaMultiSigWallet.connect(owner1).executeTransaction(to, value, data, unsortedSignatures),
      ).to.be.revertedWith("executeTransaction: duplicate or unordered signatures");

      // Also test duplicate signature
      await expect(
        metaMultiSigWallet.connect(owner1).executeTransaction(to, value, data, [sig1, sig1]),
      ).to.be.revertedWith("executeTransaction: duplicate or unordered signatures");

      expect(await metaMultiSigWallet.nonce()).to.equal(currentNonce);
    });

    it("Should fail if non-owner tries to execute", async function () {
      const { metaMultiSigWallet, contractAddress, owner1, owner2, nonOwner, getTransactionHash, signTransactionHash } =
        await loadFixture(deployMetaMultiSigWalletFixture);
      await owner1.sendTransaction({ to: contractAddress, value: parseEther("1.0") });

      const currentNonce = await metaMultiSigWallet.nonce();
      const to = nonOwner.address;
      const value = parseEther("0.5");
      const data = "0x";
      const txHash = await getTransactionHash(currentNonce, to, value, data);
      const sig1 = await signTransactionHash(owner1, txHash);
      const sig2 = await signTransactionHash(owner2, txHash);
      // Create pairs, sort by signer, extract signatures for the actual execution attempt
      const signatures = [
        { signer: owner1.address, signature: sig1 },
        { signer: owner2.address, signature: sig2 },
      ];
      signatures.sort((a, b) => (BigInt(a.signer) > BigInt(b.signer) ? 1 : -1));
      const sortedSignatures = signatures.map(s => s.signature);

      // Non-owner connects
      await expect(
        metaMultiSigWallet.connect(nonOwner).executeTransaction(to, value, data, sortedSignatures),
      ).to.be.revertedWith("executeTransaction: only owners can execute");
    });
  });

  // Add more describe blocks for other functionalities (Owner Management, Contract Interaction, etc.)
});
