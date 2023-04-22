const chai = require("chai")
chai.use(require("chai-as-promised"))

const expect = chai.expect

const MultiSigWallet = artifacts.require("MultiSigWallet")

contract("MultiSigWallet", accounts => {
  const owners = [accounts[0], accounts[1], accounts[2]]
  const NUM_CONFIRMATIONS_REQUIRED = 2

  let wallet
  beforeEach(async () => {
    wallet = await MultiSigWallet.new(owners, NUM_CONFIRMATIONS_REQUIRED)
  })

  describe("constructor", () => {
    it("should deploy", async () => {
      const wallet = await MultiSigWallet.new(
        owners,
        NUM_CONFIRMATIONS_REQUIRED
      )

      for (let i = 0; i < owners.length; i++) {
        assert.equal(await wallet.owners(i), owners[i])
      }

      assert.equal(
        await wallet.numConfirmationsRequired(),
        NUM_CONFIRMATIONS_REQUIRED
      )
    })

    it("should reject if no owners", async () => {
      await expect(MultiSigWallet.new([], NUM_CONFIRMATIONS_REQUIRED)).to.be
        .rejected
    })

    it("should reject if num conf required > owners", async () => {
      await expect(MultiSigWallet.new(owners, owners.length + 1)).to.be.rejected
    })

    it("should reject if owners not unique", async () => {
      await expect(
        MultiSigWallet.new([owners[0], owners[0]], NUM_CONFIRMATIONS_REQUIRED)
      ).to.be.rejected
    })
  })

  describe("fallback", async () => {
    it("should receive ether", async () => {
      const { logs } = await wallet.sendTransaction({
        from: accounts[0],
        value: 1,
      })

      assert.equal(logs[0].event, "Deposit")
      assert.equal(logs[0].args.sender, accounts[0])
      assert.equal(logs[0].args.amount, 1)
      assert.equal(logs[0].args.balance, 1)
    })
  })

  describe("submitTransaction", () => {
    const to = accounts[3]
    const value = 0
    const data = "0x0123"

    it("should submit transaction", async () => {
      const { logs } = await wallet.submitTransaction(to, value, data, {
        from: owners[0],
      })

      assert.equal(logs[0].event, "SubmitTransaction")
      assert.equal(logs[0].args.owner, owners[0])
      assert.equal(logs[0].args.txIndex, 0)
      assert.equal(logs[0].args.to, to)
      assert.equal(logs[0].args.value, value)
      assert.equal(logs[0].args.data, data)

      assert.equal(await wallet.getTransactionCount(), 1)

      const tx = await wallet.getTransaction(0)
      assert.equal(tx.to, to)
      assert.equal(tx.value, value)
      assert.equal(tx.data, data)
      assert.equal(tx.numConfirmations, 0)
      assert.equal(tx.executed, false)
    })

    it("should reject if not owner", async () => {
      await expect(
        wallet.submitTransaction(to, value, data, {
          from: accounts[3],
        })
      ).to.be.rejected
    })
  })

  describe("confirmTransaction", () => {
    beforeEach(async () => {
      const to = accounts[3]
      const value = 0
      const data = "0x0123"

      await wallet.submitTransaction(to, value, data)
    })

    it("should confirm", async () => {
      const { logs } = await wallet.confirmTransaction(0, {
        from: owners[0],
      })

      assert.equal(logs[0].event, "ConfirmTransaction")
      assert.equal(logs[0].args.owner, owners[0])
      assert.equal(logs[0].args.txIndex, 0)

      const tx = await wallet.getTransaction(0)
      assert.equal(tx.numConfirmations, 1)
    })

    it("should reject if not owner", async () => {
      await expect(
        wallet.confirmTransaction(0, {
          from: accounts[3],
        })
      ).to.be.rejected
    })

    it("should reject if tx does not exist", async () => {
      await expect(
        wallet.confirmTransaction(1, {
          from: owners[0],
        })
      ).to.be.rejected
    })

    it("should reject if already confirmed", async () => {
      await wallet.confirmTransaction(0, {
        from: owners[0],
      })

      await expect(
        wallet.confirmTransaction(0, {
          from: owners[0],
        })
      ).to.be.rejected
    })
  })

  describe("executeTransaction", () => {
    const to = accounts[3]
    const value = 0
    const data = "0x0"

    beforeEach(async () => {
      await wallet.submitTransaction(to, value, data)
      await wallet.confirmTransaction(0, { from: owners[0] })
      await wallet.confirmTransaction(0, { from: owners[1] })
    })

    it("should execute", async () => {
      const { logs } = await wallet.executeTransaction(0)
      // console.log(logs)
      assert.equal(logs[0].event, "ExecuteTransaction")
      assert.equal(logs[0].args.owner, owners[0])
      assert.equal(logs[0].args.txIndex, 0)

      const tx = await wallet.getTransaction(0)
      assert.equal(tx.executed, true)
    })

    it("should reject if already executed", async () => {
      await wallet.executeTransaction(0, {
        from: owners[0],
      })

      await expect(
        wallet.executeTransaction(0, {
          from: owners[0],
        })
      ).to.be.rejected
    })

    it("should reject if not owner", async () => {
      await expect(
        wallet.executeTransaction(0, {
          from: accounts[3],
        })
      ).to.be.rejected
    })

    it("should reject if tx does not exist", async () => {
      await expect(
        wallet.executeTransaction(1, {
          from: owners[0],
        })
      ).to.be.rejected
    })
  })

  describe("revokeConfirmation", async () => {
    beforeEach(async () => {
      const to = accounts[3]
      const value = 0
      const data = "0x0"

      await wallet.submitTransaction(to, value, data)
      await wallet.confirmTransaction(0, { from: owners[0] })
    })

    it("should revoke confirmation", async () => {
      const { logs } = await wallet.revokeConfirmation(0, {
        from: owners[0],
      })

      assert.equal(logs[0].event, "RevokeConfirmation")
      assert.equal(logs[0].args.owner, owners[0])
      assert.equal(logs[0].args.txIndex, 0)

      assert.equal(await wallet.isConfirmed(0, owners[0]), false)

      const tx = await wallet.getTransaction(0)
      assert.equal(tx.numConfirmations, 0)
    })

    it("should reject if not owner", async () => {
      await expect(
        wallet.revokeConfirmation(0, {
          from: accounts[3],
        })
      ).to.be.rejected
    })

    it("should reject if tx does not exist", async () => {
      await expect(
        wallet.revokeConfirmation(1, {
          from: owners[0],
        })
      ).to.be.rejected
    })
  })

  describe("getOwners", () => {
    it("should return owners", async () => {
      const res = await wallet.getOwners()

      for (let i = 0; i < res.length; i++) {
        assert.equal(res[i], owners[i])
      }
    })
  })

  describe("getTransactionCount", () => {
    it("should return tx count", async () => {
      assert.equal(await wallet.getTransactionCount(), 0)
    })
  })
})
