
async function testFetch() {
    try {
        const res = await fetch('https://myshop-api-9pd4.onrender.com/api/shop/mobile-orders/branding', {
            method: 'GET',
            headers: {
                'Origin': 'https://myshop-client-qtk6.onrender.com',
            }
        });

        console.log('GET Status:', res.status);
        console.log('GET Headers:');
        for (let [k, v] of res.headers.entries()) {
            console.log(`  ${k}: ${v}`);
        }
        const text = await res.text();
        console.log('Body:', text.slice(0, 100));
    } catch (err) {
        console.error(err);
    }
}

testFetch();
