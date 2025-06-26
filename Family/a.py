from collections import deque

class TreeNode:
    def __init__(self, val):
        self.val = val
        self.children = []

def level_order_traversal(root):
    if not root:
        return []

    result = []
    queue = deque([root])

    while queue:
        level_size = len(queue)
        level_nodes = []

        for _ in range(level_size):
            node = queue.popleft()
            level_nodes.append(node.val)
            for child in node.children:
                queue.append(child)

        result.append(level_nodes)

    return result
# 构建一个简单的树
root = TreeNode(1)
child1 = TreeNode(2)
child2 = TreeNode(3)
child3 = TreeNode(4)
root.children = [child1, child2, child3]
child1.children = [TreeNode(5), TreeNode(6)]
child3.children = [TreeNode(7)]

# 执行遍历
print(level_order_traversal(root))
# 输出: [[1], [2, 3, 4], [5, 6, 7]]
