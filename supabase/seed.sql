-- 插入2条测试诈骗案例，向量后续运行脚本自动生成，这里不写embedding
INSERT INTO cases (id,title,category,risk_label,content) VALUES
('afa69073-74d1-42aa-aab8-6cc4ca0cd972','冒充客服退款诈骗','冒充客服诈骗','诈骗','骗子伪装电商客服，以订单异常为由诱导转账退款'),
('ac6c13ec-0625-479f-9778-bdcffeb913f0','快递理赔诈骗','快递理赔诈骗','诈骗','冒充快递公司，谎称包裹丢失，诱导受害人点击链接理赔');
