import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // KỸ NĂNG MỚI: BÁO CÁO CÔNG TẮC CHO WEB KHÁCH
    if (req.method === 'GET') {
        const { data } = await supabase.from('vouchers').select('account_data').eq('code', 'SYS_HIDDEN_PRODUCTS').single();
        return res.status(200).json({ hidden: data && data.account_data ? JSON.parse(data.account_data) : [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST/GET' });

    const { userKey, productId } = req.body;
    if (!userKey || !productId) return res.status(400).json({ error: "Thiếu dữ liệu!" });

    try {
        const { data: keyData, error: dbError } = await supabase
            .from('vouchers').select('*').eq('code', userKey).single();

        if (dbError || !keyData) return res.status(400).json({ error: "Key xịt hoặc đéo tồn tại!" });

        if (keyData.is_used) {
            const thoiGian = new Date(keyData.used_at).toLocaleString('vi-VN');
            return res.status(400).json({ error: `Key này đã bị thằng nào húp vào lúc ${thoiGian} rồi sếp ơi!` });
        }

        if (keyData.product_id !== productId) return res.status(400).json({ error: "Gian lận! Sai món hàng!" });

        const apiKey = process.env.NL_API_KEY; 
        const formData = new URLSearchParams();
        formData.append('apikey', apiKey); 
        formData.append('action', 'buyProduct'); 
        formData.append('id', productId); 
        formData.append('amount', '1');

        const nlResponse = await fetch('https://nguyenlieummo.vn/api/buy_product', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        const nlData = await nlResponse.json();

        if (nlData.status === 'success' || nlData.status === true || nlData.status === 200 || nlData.message === 'Thành công') {
            const thongTinHang = nlData.data || nlData.list || JSON.stringify(nlData);
            
            await supabase.from('vouchers').update({ 
                is_used: true, 
                used_at: new Date().toISOString(), 
                account_data: typeof thongTinHang === 'string' ? thongTinHang : JSON.stringify(thongTinHang) 
            }).eq('id', keyData.id);
            
            return res.status(200).json({ success: true, data: thongTinHang });
        } else {
            return res.status(400).json({ error: "Sàn hết hàng hoặc lỗi: " + (nlData.msg || nlData.message) });
        }
    } catch (err) {
        return res.status(500).json({ error: "Lỗi hệ thống: " + err.message });
    }
}