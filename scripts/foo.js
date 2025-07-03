
const data = {
    name: "李周氏", age: 102,
    children: [
        {
            name: "李国栋", age: 80,
            children: [
                {
                    name: "李志远", age: 58,
                    children: [
                        { name: "李正豪", age: 36, children: [{ name: "李朝阳", age: 12 }] },
                        { name: "李正轩", age: 35, children: [{ name: "李晓阳", age: 11 }] },
                        { name: "李正宇", age: 33, children: [{ name: "李文博", age: 9 }, { name: "李文昊", age: 6 }, { name: "李文轩", age: 4 }] },
                        { name: "李正航", age: 32, children: [{ name: "李星辰", age: 8 }] },
                        { name: "李婉婷", age: 30, children: [{ name: "王思远", age: 7 }] }  // 嫁入王家
                    ]
                },
                {
                    name: "李志宏", age: 56,
                    children: [
                        { name: "李正阳", age: 34, children: [{ name: "李泽宇", age: 10 }] },
                        { name: "李正明", age: 32, children: [{ name: "李雨萱", age: 8 }] },
                        { name: "李正清", age: 30, children: [{ name: "李欣怡", age: 5 }] },
                        { name: "李正华", age: 28, children: [{ name: "李昊然", age: 3 }] },
                        { name: "李玉玲", age: 26, children: [] }
                    ]
                },
                {
                    name: "李志伟", age: 54,
                    children: [
                        { name: "李浩然", age: 29 },
                        { name: "李梦瑶", age: 27, children: [{ name: "张子涵", age: 2 }] }  // 嫁入张家
                    ]
                },
                {
                    name: "李志强", age: 51,
                    children: [
                        { name: "李正飞", age: 28, children: [{ name: "李梓涵", age: 4 }] },
                        { name: "李佳琪", age: 25, children: [{ name: "陈宇航", age: 1 }] }  // 嫁入陈家
                    ]
                }
            ]
        }
    ]
};

function browseData(person)
{
    console.log("Person:", person.name);

    (person.children || []).forEach(child => 
        browseData(child)
    );
}

browseData(data);

console.log("it is success");