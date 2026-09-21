import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

/**
 * Deploys AssociationProbe.
 *
 * The only contract this template ships. It demonstrates calling Hedera's
 * system contracts from Solidity, and the response-code mistake that makes
 * those calls silently dangerous.
 *
 * Gas note: calls that touch a system contract cost far more than the same
 * call would on Ethereum, which is why the limit here is generous rather than
 * tuned. An under-provisioned deploy fails with INSUFFICIENT_GAS, which reads
 * like a code problem and is not one.
 */
const deployAssociationProbe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("AssociationProbe", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployAssociationProbe.tags = ["AssociationProbe"];
export default deployAssociationProbe;
