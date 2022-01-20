export const TORNADO_TREES = "0x722122dF12D4e14e13Ac3b6895a86e84145b6967"

export const PATH_ARTIFACTS = "artifacts/circuits/BatchTreeUpdate"
export const PATH_TREES = "contracts/interfaces/ITornadoTrees.sol:ITornadoTrees"
export const PATH_ERC = "contracts/interfaces/IERC20.sol:IERC20"

export const TREES_BLOCK_DEPLOY = 4912105
export const TREE_HEIGHT = 4
export const TREE_DEPTH = 20

export const solConfig  = {
    optimizer: {
      enabled: true,
      runs: 200,
    }
 }

 export const treeSearchParams = {
    depositsFrom: 1,
    depositsStep: 1,
    withdrawalsFrom: 2,
    withdrawalsStep: 2
 }

export const mockData = {
   instances: [
     '0x1111000000000000000000000000000000001111',
     '0x2222000000000000000000000000000000002222',
     '0x3333000000000000000000000000000000003333',
     '0x4444000000000000000000000000000000004444'
   ],
   blocks: [
     '0xaaaaaaaa', '0xbbbbbbbb', '0xcccccccc', '0xdddddddd'
   ]
 }
