import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/config/app_config.dart';

class PerformanceScreen extends StatelessWidget {
  const PerformanceScreen({super.key});

  Future<void> _export(BuildContext context) async {
    final url =
        '${AppConfig.apiBaseUrl}/api${EndPoints.performance}?format=csv';
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Performance')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Export performance CSV from admin-api'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => _export(context),
              child: const Text('Open CSV export'),
            ),
            const SizedBox(height: 24),
            FutureBuilder(
              future: DioHelper.getData(url: EndPoints.performance),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const CircularProgressIndicator();
                }
                final res = snapshot.data!;
                if (res.statusCode != 200) {
                  return Text(DioHelper.errorMessage(res) ?? 'Load failed');
                }
                final data = res.data;
                if (data is List) {
                  return Text('${data.length} performance rows loaded');
                }
                return const Text('Performance data available');
              },
            ),
          ],
        ),
      ),
    );
  }
}
